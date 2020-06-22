const _ = require('lodash'),
    async = require('async'),
    request = require('postman-request'),
    { JWS } = require('jose'),

    { LCMError } = require('./errors');

class Requester {
    constructor (options) {
        this.requester = request.defaults({
            forever: true
        });
        this.directoryUrl = options.directoryUrl;
        this.directory = undefined;
    }

    _request (options, done) {
        this.requester(options, (err, response, body) => {
            if (err) { return done(err); }

            let result = {
                nonce: response.headers['replay-nonce'],
                retryAfter: response.headers['retry-after'],
                location: response.headers.location,
                responseCode: response.statusCode,
                data: body
            };

            return done(null, result);
        });
    }

    _getDirectory (done) {
        this.request({ method: 'get', url: this.directoryUrl, json: true }, (err, result) => {
            if (err) { return done(err); }

            return done(null, result.data);
        });
    }

    _getResourceUrl (name, done) {
        if (_.isPlainObject(this.directory)) {
            return done(null, this.directory[name]);
        }

        this._getDirectory((err, directory) => {
            if (err) { return done(err); }

            this.directory = directory;

            return done(null, directory[name]);
        });
    }

    _getNonce (done) {
        this._getResourceUrl('newNonce', (err, url) => {
            if (err) { return done(err); }

            this.request({ method: 'get', url: url }, (err, result) => {
                if (err) { return done(err); }

                return done(null, result.nonce);
            });
        });
    }

    _makeSignedRequest (options, done) {
        let { key, payload, nonce, url, accountId, method, protectedHeader = {}, requestHeaders = {} } = options;

        async.auto({
            nonce: (next) => {
                if (nonce) { return next(null, nonce); }

                this._getNonce(next);
            },
            request: ['nonce', (results, next) => {
                let requestOptions = {
                    method: method,
                    url: url,
                    headers: _.assign({
                        'content-type': 'application/jose+json'
                    }, requestHeaders),
                    json: true
                };

                _.assign(protectedHeader, { nonce: results.nonce, url: url });

                if (accountId) { protectedHeader.kid = accountId; }

                requestOptions.body = JWS.sign.flattened(payload, key, protectedHeader);

                this._request(requestOptions, next);
            }]
        },
        (err, results) => {
            if (err) { return done(err); }

            return done(null, results.request);
        });
    }

    _makeSignedResourceRequest (resourceName, options, done) {
        this._getResourceUrl(resourceName, (err, url) => {
            if (err) { return done(err); }

            options.url = url;

            this._makeSignedRequest(options, done);
        });
    }

    signedRequest (options, done) {
        if (options.url) {
            return this._makeSignedRequest(options, done);
        }

        if (options.resourceName) {
            return this._makeSignedResourceRequest(options.resourceName, _.omit(options, ['resourceName']), done);
        }

        return done(new LCMError('Require either url or resource name to make signed request'));
    }

    request (options, done) {
        return this._request(options, done);
    }
}

module.exports = Requester;

