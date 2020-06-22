const _ = require('lodash'),
    async = require('async'),

    { AcmeError, LCMError } = require('./util/errors');

class Order {
    constructor (account, domain, csr, requester, challenge, config) {
        this.account = account;
        this.domain = domain;
        this.csr = csr;

        this.config = _.assign({
            timeout: 500,
            maxRetries: 10
        }, config);

        this.requester = requester;
        this.challenge = challenge;
        this.nonce = undefined;
        this.order = {};
    }

    _parseOrder (response) {
        let url = _.get(response, 'location'),
            data = _.get(response, 'data', {}),
            { status, finalize, certificate } = data,
            authorization = _.get(data, 'authorizations.0'),
            challenge = _.find(data.challenges, { type: this.challenge.type }),
            orderData = _.pickBy({
                url,
                status,
                finalize,
                certificate,
                authorization,
                challenge
            }, _.identity);

        return orderData;
    }

    static responseHasError (response) {
        let data = _.get(response, 'data');

        return (response.statucCode >= 400 || (data.type && data.detail));
    }

    _request (options, done) {
        _.assign(options, {
            key: this.account.key,
            accountId: this.account.id,
            nonce: this.nonce
        });

        this.nonce = undefined;

        this.requester.signedRequest(options, (err, response) => {
            if (err) { return done(err); }

            this.nonce = _.get(response, 'nonce');

            return done(null, response);
        });
    }

    _placeOrder (done) {
        this._request({
            resourceName: 'newOrder',
            payload: {
                identifiers: [
                    {
                        type: 'dns',
                        value: this.domain
                    }
                ]
            },
            method: 'POST'
        }, done);
    }

    _checkOrder (done) {
        this._request({
            url: this.order.url,
            payload: '',
            method: 'POST'
        }, done);
    }

    _fetchChallenges (done) {
        this._request({
            url: this.order.authorization,
            payload: '',
            method: 'POST'
        }, done);
    }

    _acceptChallenge (done) {
        let { url } = _.get(this.order, 'challenge', {});

        this._request({
            url: url,
            payload: {},
            method: 'POST'
        }, done);
    }

    _finalize (done) {
        this.retries === 0;

        this._request({
            url: this.order.finalize,
            payload: {
                csr: this.csr
            },
            method: 'POST'
        }, done);
    }

    _downloadCertificate (done) {
        this._request({
            url: this.order.certificate,
            payload: '',
            requestHeaders: {
                accept: 'application/pem-certificate-chain'
            },
            method: 'POST'
        }, done);
    }

    _deactivateAuthorization (done) {
        this._request({
            url: this.order.authorization,
            payload: {
                status: 'deactivated'
            },
            method: 'POST'
        }, done);
    }

    procure (done) {
        async.auto({
            order: (next) => {
                this._placeOrder((err, response) => {
                    if (err) { return next(err); }

                    let order = this._parseOrder(response),
                        hasError = Order.responseHasError(response);

                    if (hasError) {
                        return next(new AcmeError('Error making order', response.responseCode, response.data));
                    }

                    _.assign(this.order, order);

                    return next(null, order);
                });
            },
            fetchChallenges: ['order', (results, next) => {
                // Skip if order status is not pending
                if (results.order.status !== 'pending') { return next(); }

                this._fetchChallenges((err, response) => {
                    if (err) { return next(err); }

                    let order = this._parseOrder(response),
                        hasError = Order.responseHasError(response);

                    if (hasError) {
                        return next(new AcmeError('Error fetching challenges', response.responseCode, response.data));
                    }

                    _.assign(this.order, order);

                    return next(null, order);
                });
            }],
            acceptChallenge: ['fetchChallenges', (results, next) => {
                if (this.order.status !== 'pending') { return next(); }

                let { token, status } = _.get(results.fetchChallenges, 'challenge'),
                    authzKey = `${token}.${this.account.key.thumbprint}`;

                if (status !== 'pending') { return next(); }

                this.challenge.manager.set({}, this.domain, token, authzKey, (err) => {
                    if (err) { return next(err); }

                    this._acceptChallenge((err, response) => {
                        if (err) { return next(err); }

                        if (Order.responseHasError(response)) {
                            return next(new AcmeError('Error accepting challenge',
                                response.responseCode, response.data));
                        }

                        return next();
                    });
                });
            }],
            pollStatusReady: ['acceptChallenge', (results, next) => {
                let counter = 0;

                async.whilst((cb) => {
                    let keepPolling = (this.order.status === 'pending' && counter < this.config.maxRetries);

                    counter++;

                    return cb(null, keepPolling);
                },
                (cb) => {
                    setTimeout(this._checkOrder.bind(this), this.config.timeout, (err, response) => {
                        if (err) { return cb(err); }

                        let order = this._parseOrder(response),
                            hasError = Order.responseHasError(response);

                        if (hasError) {
                            return cb(new AcmeError('Error while polling order',
                                response.responseCode, response.data));
                        }

                        _.assign(this.order, order);

                        return cb();
                    });
                }, next);
            }],
            finalize: ['pollStatusReady', (results, next) => {
                if (this.order.status === 'valid' || this.order.status === 'processing') { return next(); }

                if (this.order.status !== 'ready') {
                    return next(new AcmeError(`Cannot finalize a order in ${this.order.status} state`));
                }

                this._finalize((err, response) => {
                    if (err) { return next(err); }

                    let order = this._parseOrder(response),
                        hasError = Order.responseHasError(response);

                    if (hasError) {
                        return next(new AcmeError('Error while finalizing order',
                            response.responseCode, response.data));
                    }

                    _.assign(this.order, order);

                    return next();
                });
            }],
            pollStatusValid: ['finalize', (results, next) => {
                if (this.order.status === 'valid') { return next(); }

                if (this.order.status !== 'processing') {
                    return next(new AcmeError(`Order in unexpected state - ${this.order.status}`));
                }

                let counter = 0;

                async.whilst((cb) => {
                    let keepPolling = (this.order.status === 'processing' && counter < this.config.maxRetries);

                    counter++;

                    return cb(null, keepPolling);
                },
                (cb) => {
                    setTimeout(this._checkOrder.bind(this), this.config.timeout, (err, response) => {
                        if (err) { return cb(err); }

                        let order = this._parseOrder(response),
                            hasError = Order.responseHasError(response);

                        if (hasError) {
                            return cb(new AcmeError('Error while polling order',
                                response.responseCode, response.data));
                        }

                        _.assign(this.order, order);

                        return cb();
                    });
                }, next);
            }],
            download: ['pollStatusValid', (results, next) => {
                if (this.order.status !== 'valid') {
                    return next(new AcmeError('Expected order to be in valid state'));
                }

                this._downloadCertificate((err, response) => {
                    if (err) { return next(err); }

                    if (response.responseCode !== 200) {
                        return next(new AcmeError('Error downloading certificate',
                            response.responseCode, response.data));
                    }

                    return next(null, response.data);
                });
            }]
        },
        (err, results) => {
            if (_.get(this.order, 'challenge.token')) {
                this.challenge.manager.remove({}, this.domain, this.order.challenge.token, _.noop);
            }

            if (err) {
                this._deactivateAuthorization(_.noop);

                return done(err);
            }

            return done(null, results.download);
        });
    }
}

module.exports = Order;

