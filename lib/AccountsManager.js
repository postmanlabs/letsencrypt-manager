const _ = require('lodash'),
    async = require('async'),

    { generateKey, formatKey, jwkToKey } = require('./util/crypto'),
    { AcmeError } = require('./util/errors');

class AccountsManager {
    constructor (manager) {
        this.manager = manager;
    }

    _register (key, email, tos, done) {
        let payload = {
                termsOfServiceAgreed: tos,
                contact: [
                    `mailto:${email}`
                ]
            },
            protectedHeader = {
                jwk: key.toJWK(false)
            };

        this.manager.requester.signedRequest({
            resourceName: 'newAccount',
            key: key,
            payload: payload,
            method: 'POST',
            protectedHeader: protectedHeader
        },
        (err, result) => {
            if (err) { return done(err); }

            if (_.get(result, 'data.status') !== 'valid') {
                return done(new AcmeError('Error creating new account', result));
            }

            let account = {
                id: result.location,
                meta: _.pick(result.data, ['contact', 'initialIp', 'createdAt', 'status'])
            };

            return done(null, { account: account, nonce: result.nonce });
        });
    }

    registerAccount (email, tos, done) {
        async.auto({
            key: (next) => {
                next(null, generateKey());
            },
            register: ['key', (results, next) => {
                this._register(results.key, email, tos, next);
            }],
            store: ['register', (results, next) => {
                let opts = { email },
                    formattedKey = formatKey(results.key),
                    accountId = _.get(results.register, 'account.id'),
                    registration = {
                        keypair: formattedKey,
                        receipt: {
                            accountId: accountId,
                            meta: _.get(results.register, 'account.meta', {})
                        }
                    };

                this.manager.store.accounts.set(opts, registration, (err) => {
                    if (err) { return next(err); }

                    return next(null, { keypair: formattedKey, accountId: accountId });
                });
            }]
        },
        (err, results) => {
            if (err) { return done(err); }

            return done(null, {
                key: results.key,
                id: _.get(results.register, 'account.id')
            });
        });
    }


    getAccount (email, tos, done) {
        this.manager.store.accounts.check({ email }, (err, data) => {
            if (err) { return done(err); }

            if (data && data.keypair) {
                return done(null, {
                    key: jwkToKey(data.keypair.privateKeyJwk),
                    id: _.get(data, 'receipt.accountId')
                });
            }

            this.registerAccount(email, tos, done);
        });
    }
}

module.exports = AccountsManager;

