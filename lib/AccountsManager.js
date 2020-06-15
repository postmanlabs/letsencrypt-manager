const _ = require('lodash'),
    async = require('async'),
    { JWK, JWS } = require('jose'),

    AccountsManager = class {
        constructor (manager) {
            this.manager = manager;
        }

        registerAccount (email, tos, done) {
            async.auto({
                nonce: (next) => {
                    this.manager.getNonce(next);
                },
                url: (next) => {
                    this.manager.getResource('newAccount', next);
                },
                key: (next) => {
                    let key = JWK.generateSync('RSA', 4096, {
                        use: 'sig',
                        alg: 'RS256'
                    });

                    return next(null, key);
                },
                register: ['nonce', 'url', 'key', (results, next) => {
                    let payload = {
                            termsOfServiceAgreed: tos,
                            contact: [
                                `mailto:${email}`
                            ]
                        },
                        prot = {
                            url: results.url,
                            nonce: results.nonce,
                            jwk: results.key.toJWK(false)
                        },
                        body = JWS.sign.flattened(payload, results.key, prot);

                    this.manager.requester.post({
                        url: results.url,
                        headers: {
                            'content-type': 'application/jose+json'
                        },
                        body: body,
                        json: true
                    },
                    (err, response, result) => {
                        if (err) { return next(err); }

                        if (response.statusCode !== 201) {
                            return next(new Error('Invalid response from LE'));
                        }

                        if (result.status !== 'valid') {
                            return next(new Error('Error from LE'));
                        }

                        return next();
                    });
                }]
            },
            (err, results) => {
                if (err) { return done(err); }

                return done(null, results.key);
            });
        }
    };

module.exports = AccountsManager;

