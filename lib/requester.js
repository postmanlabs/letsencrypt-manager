const _ = require('lodash'),
    request = require('postman-request'),

    { JWS } = require('jose'),

    LetsEncryptError = function LetsEncryptError(message, type, status) {
        Error.captureStackTrace && Error.captureStackTrace(this);

        let errName;

        _.isString(type) && (errName = type.split(':').pop());
        !type || !_.isString(type) && (errName = 'unknownError');

        this.name = this.constructor.name;
        this.message = `[${errName}] ${message}`;
        this.options = {
            type,
            status
        };
    },

    Requester = class {
        constructor (options) {
            this.requester = request.defaults({
                forever: true
            });
            this.directoryUrl = options.directoryUrl;
            this.directory;
        }

        request (options, done) {
            request(options, (err, response, body) => {
                if (err) { return done(err); }

                let isError = response.statusCode >= 400,
                    error;

                if (isError) {
                    error = _.pick(body, ['type', 'detail']);

                    return done(new LetsEncryptError(error.detail, error.type, resposne.statusCode));
                }

                let result = {
                    nonce: response.header['replay-nonce'],
                    location: response.header['location'],
                    status: response.statusCode,
                    data: body
                };

                return done(null, result);
            });
        }

        getDirectory (done) {
            this.request({ method: 'get', url: this.directoryUrl, json: true }, (err, result) => {
                if (err) { return done(err); }

                return done(null, result.data);
            });
        }

        getResourceUrl(name, done) {
            if (_.isPlainObject(this.directory)) {
                return done(null, this.directory[name]);
            }

            this.getDirectory((err, directory) => {
                if (err) { return done(err); }

                this.directory = directory;

                return done(null, directory[name]);
            });
        }

        getNonce (done) {
            this.getResourceUrl('newNonce', (err, url) => {
                if (err) { return done(err); }

                this.request({ method: 'get', url: url }, (err, result) => {
                    if (err) { return done(err); }

                    return done(null, result.nonce);
                });
            });
        }

        makeSignedRequest(options, done) {

        }
    };

inherits(LetsEncryptError, Error);

module.exports = Requester;
