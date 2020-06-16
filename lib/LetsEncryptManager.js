const _ = require('lodash'),
    request = require('postman-request'),

    AccountsManager = require('./AccountsManager'),
    CertificateManager = require('./CertificateManager'),

    LE_ENVIRONMENTS = {
        staging: {
            directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory'
        },
        production: {
            directoryUrl: 'https://acme-v02.api.letsencrypt.org/directory'
        }
    },

    DEFAULT_ENVIRONMENT = 'staging',

    LetsEncryptManager = class {
        constructor (options) {
            this.environment = _.get(LE_ENVIRONMENTS, options.environment, LE_ENVIRONMENTS[DEFAULT_ENVIRONMENT]);
            this.directoryUrl = this.environment.directoryUrl;
            this.requester = request.defaults({
                forever: true
            });

            this.challengeType = options.challengeType || 'http-01';

            this.accountsManager = new AccountsManager(this);
            this.certificateManager = new CertificateManager(this);
            this.store = options.store.create();
            this.challengeManager = options.challenges[this.challengeType].create();
        }

        register (domain, email, tnc, done) {
            this.certificateManager.get(domain, email, done);
        }

        getResource (name, done) {
            if (_.isPlainObject(this.directory)) {
                return done(null, this.directory[name]);
            }

            this.requester.get({
                url: this.directoryUrl,
                json: true
            },
            (err, response, data) => {
                if (err) { return done(err); }

                if (response.statusCode !== 200) {
                    return done(new Error('Invalid response code from LE'));
                }

                this.directory = data;

                return done(null, this.directory[name]);
            });
        }

        getNonce (done) {
            this.getResource('newNonce', (err, url) => {
                if (err) { return done(err); }

                this.requester.get({
                    url
                },
                (err, response) => {
                    if (err) { return done(err); }

                    if (response.statusCode !== 204) {
                        return done(new Error('Invalid response from LE'));
                    }

                    return done(null, response.headers['replay-nonce']);
                });
            });
        }
    };

module.exports = LetsEncryptManager;

