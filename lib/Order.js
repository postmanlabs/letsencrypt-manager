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

    static _parseOrder (response) {
        let url = _.get(response, 'location'),
            data = _.get(response, 'data', {}),
            { status, finalize, certificate } = data,
            authorization = _.get(data, 'authorizations.0'),
            orderData = _.pickBy({
                url,
                status,
                finalize,
                certificate,
                authorization
            }, _.identity);

        return orderData;
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

    _orderRequest (options, done) {
        this._request(options, (err, response) => {
            if (err) { return done(err); }

            let data = _.get(response, 'data', {}),
                { status } = data;

            if (status === 'invalid') {
                return done(new AcmeError('Order failed, status invalid', { response }));
            }

            if (status === 'deactivated') {
                return done(new AcmeError('Cannot complete order. Authorization has been deactivated', { response }));
            }

            if (response.statusCode >= 400 || (data.type && data.detail)) {
                return done(new AcmeError('Received error from server', { response }));
            }

            return done(null, response, Order._parseOrder(response));
        });
    }

    _placeOrder (done) {
        this._orderRequest({
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
        this._orderRequest({
            url: this.order.url,
            payload: '',
            method: 'POST'
        }, done);
    }

    _fetchChallenge (done) {
        this._request({
            url: this.order.authorization,
            payload: '',
            method: 'POST'
        }, done);
    }

    _acceptChallenge (done) {
        let { url } = _.get(this.authorization, 'challenge', {});

        this._request({
            url: url,
            payload: {},
            method: 'POST'
        }, done);
    }

    _finalize (done) {
        this._orderRequest({
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
        async.series({
            order: (next) => {
                this._placeOrder((err, response, order) => {
                    if (err) { return next(err); }

                    _.assign(this.order, order);

                    return next();
                });
            },
            fetchChallenge: (next) => {
                // Skip if order status is not pending
                if (this.order.status !== 'pending') { return next(); }

                this._fetchChallenge((err, response) => {
                    if (err) { return next(err); }

                    let data = _.get(response, 'data', {});

                    if (response.statusCode >= 400 || (data.type && data.detail)) {
                        return next(new AcmeError('Error fetching challenge', { response }));
                    }

                    this.authorization = {
                        status: data.status,
                        challenge: _.find(data.challenges, { type: this.challenge.type })
                    };

                    return next();
                });
            },
            acceptChallenge: (next) => {
                // Skip if order is not pending
                if (this.order.status !== 'pending') { return next(); }

                // Authorization and challenge don't exist. Skip.
                // This is likely because challenge was not fetched in the
                // previous step.
                // This could be because of an error, or because
                // the order status was not "pending". Skip to the
                // next step to check for order status.
                if (!this.authorization) { return next(); }

                // If authorization status is not "pending", skip to next step.
                // Either authorization has suceeded, or it has failed (for any reason).
                // Check order status in next step to decide what to do next.
                if (this.authorization.status !== 'pending') { return next(); }

                let { token, status } = _.get(this.authorization, 'challenge', {}),
                    authzKey;

                // If challenge status is not "pending", skip to next step.
                if (status !== 'pending') { return next(); }

                authzKey = `${token}.${this.account.key.thumbprint}`;

                this.challenge.manager.set({}, this.domain, token, authzKey, (err) => {
                    if (err) { return next(err); }

                    this._acceptChallenge((err, response) => {
                        if (err) { return next(err); }

                        let data = _.get(response, 'data', {});

                        if (response.statusCode >= 400 || (data.type && data.detail)) {
                            return next(new AcmeError('Error accepting ACME challenge', { response }));
                        }

                        return next();
                    });
                });
            },
            pollStatusReady: (next) => {
                let counter = 0,
                    max = this.config.maxRetries;

                async.whilst((cb) => {
                    let keepPolling = (this.order.status === 'pending' && counter < max);

                    counter++;

                    return cb(null, keepPolling);
                },
                (cb) => {
                    setTimeout(this._checkOrder.bind(this), this.config.timeout, (err, response, order) => {
                        if (err) { return cb(err); }

                        _.assign(this.order, order);

                        return cb();
                    });
                },
                (err) => {
                    if (err) { return next(err); }

                    if (this.order.status === 'pending' || counter >= max) {
                        return next(new LCMError(`Order stuck in pending. Bailing out after ${max} retries`, {
                            acme: { status: this.order.status }
                        }));
                    }

                    return next();
                });
            },
            finalize: (next) => {
                // If status is valid then go download the certificate.
                // If status is processing, then keep polling order status.
                if (this.order.status === 'valid' || this.order.status === 'processing') { return next(); }

                // Can only finalize order in ready state.
                // Highly unlikely that order can be at any state other than "ready"  at this point.
                if (this.order.status !== 'ready') {
                    return next(new AcmeError('Cannot finalize order. Status needs to be "ready" to finalize.', {
                        acme: { orderStatus: this.order.status }
                    }));
                }

                this._finalize((err, response, order) => {
                    // Order is in a state where it can't be finalized. It is highly unlikely
                    // that the order is "pending" at this stage.
                    // So the order is either in "processing" or "valid" states.
                    // The order cached locally has likely diverged from the actual order
                    // so can't rely on it till we check again.
                    // Skip to the next step which will poll order status before
                    // deciding the next step.
                    if (err && err.options.acme.friendlyError === 'orderNotReady') {
                        return next();
                    }

                    if (err) { return next(err); }

                    _.assign(this.order, order);

                    return next();
                });
            },
            pollStatusValid: (next) => {
                // If order status is "valid" then certificate is available. Go download.
                if (this.order.status === 'valid') { return next(); }

                let counter = 0,
                    max = this.config.maxRetries;

                // Use async.doWhilst instead of async.whilst as we need to check
                // order status online as we can't trust the order cached locally
                // at this point.
                async.doWhilst((cb) => {
                    setTimeout(this._checkOrder.bind(this), this.config.timeout, (err, response, order) => {
                        if (err) { return cb(err); }

                        _.assign(this.order, order);

                        return cb();
                    });
                },
                (cb) => {
                    let keepPolling = (this.order.status === 'processing' && counter < max);

                    counter++;

                    return cb(null, keepPolling);
                },
                (err) => {
                    if (err) { return next(err); }

                    if (this.order.status !== 'valid' || counter >= max) {
                        return next(new LCMError(`Order stuck. Bailing out after ${max} retries`, {
                            acme: { status: this.order.status }
                        }));
                    }

                    return next();
                });
            },
            download: (next) => {
                if (this.order.status !== 'valid') {
                    return next(new AcmeError('Cannot download certificate if order status is not "valid"', {
                        acme: { status: this.order.status }
                    }));
                }

                this._downloadCertificate((err, response) => {
                    if (err) { return next(err); }

                    if (response.statusCode !== 200) {
                        return next(new AcmeError('Error downloading certificate', { response }));
                    }

                    return next(null, response.data);
                });
            }
        },
        (err, results) => {
            if (_.get(this.authorization, 'challenge.token')) {
                this.challenge.manager.remove({}, this.domain, this.authorization.challenge.token, _.noop);
            }

            if (err) { return done(err); }

            return done(null, results.download);
        });
    }
}

module.exports = Order;

