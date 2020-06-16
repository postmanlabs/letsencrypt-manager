const _ = require('lodash'),
    async = require('async'),
    moment = require('moment'),
    forge = require('node-forge'),
    { JWK, JWS } = require('jose'),
    { RSA } = require('rsa-compat'),

    CertificateManager = class {
        constructor (manager) {
            this.manager = manager;
        }

        get (domain, email, done) {
            this.manager.store.certificates.check({ domains: [domain] }, (err, cert) => {
                if (err) { return done(err); }

                let issueNew,
                    pem;

                if (!cert) {
                    issueNew = true;
                }
                else {
                    pem = forge.pki.certificateFromPem(cert.cert);
                    issueNew = moment.utc(pem.validity.notAfter).diff(moment.utc(), 'd') < 30;
                }

                if (!issueNew) {
                    return done(null, cert);
                }

                this.order(domain, email, done);
            });
        }

        order (domain, accountIdentifier, done) {
            async.auto({
                nonce: (next) => {
                    this.manager.getNonce(next);
                },
                url: (next) => {
                    this.manager.getResource('newOrder', next);
                },
                key: (next) => {
                    this.manager.accountsManager.getAccount(accountIdentifier, (err, account) => {
                        if (err) { return next(err); }

                        return next(null, JWK.asKey(account.keypair.privateKeyJwk, {
                            alg: 'RS256',
                            use: 'sig'
                        }));
                    });
                },
                keypair: (next) => {
                    this.manager.store.certificates.checkKeypair({ domain: [domain] }, (err, keypair) => {
                        if (err) { return next(err); }

                        if (keypair) { return next(null, keypair); }

                        RSA.generateKeypair({ bitlen: 4096 }, (err, kp) => {
                            if (err) { return next(err); }

                            let opts = {
                                email: accountIdentifier,
                                domain: domain
                            };

                            this.manager.store.certificates.setKeypair(opts, kp, (err) => {
                                if (err) { return next(err); }

                                return next(null, kp);
                            });
                        });
                    });
                },
                csr: ['keypair', (results, next) => {
                    let csr = RSA.generateCsrWeb64(results.keypair, [domain]);

                    return next(null, csr);
                }],
                order: ['nonce', 'url', 'key', (results, next) => {
                    let payload = {
                            identifiers: [
                                {
                                    type: 'dns',
                                    value: domain
                                }
                            ]
                        },
                        prot = {
                            nonce: results.nonce,
                            url: results.url,
                            kid: results.key.kid
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
                    (err, response, data) => {
                        if (err) { return next(err); }

                        if (response.statusCode !== 201) {
                            return next(new Error('Invalid response from LE'));
                        }

                        if (data.status !== 'pending') {
                            return next(new Error('Invalid response from LE'));
                        }

                        let nonce = response.headers['replay-nonce'],
                            orderUrl = response.headers.location;

                        return next(null, { data, nonce, orderUrl });
                    });
                }],
                authorization: ['order', (results, next) => {
                    let authorizationUrl = results.order.data.authorizations[0],
                        payload = '',
                        prot = {
                            nonce: results.order.nonce,
                            url: authorizationUrl,
                            kid: results.key.kid
                        },
                        body = JWS.sign.flattened(payload, results.key, prot);

                    this.manager.requester.post({
                        url: authorizationUrl,
                        headers: {
                            'content-type': 'application/jose+json'
                        },
                        body: body,
                        json: true
                    },
                    (err, response, data) => {
                        if (err) { return next(err); }

                        if (response.statusCode !== 200) {
                            return next(new Error('Error getting challenge from LE'));
                        }

                        let nonce = response.headers['replay-nonce'];

                        return next(null, { data, nonce });
                    });
                }],
                challenge: ['authorization', (results, next) => {
                    let challenge = _.find(results.authorization.data.challenges, { type: 'http-01' }),
                        payload = {},
                        prot = {
                            nonce: results.authorization.nonce,
                            url: challenge.url,
                            kid: results.key.kid
                        },
                        body = JWS.sign.flattened(payload, results.key, prot),
                        authzKey = `${challenge.token}.${results.key.thumbprint}`;

                    this.manager.challengeManager.set({}, domain, challenge.token, authzKey, (err) => {
                        if (err) { return next(err); }

                        this.manager.requester.post({
                            url: challenge.url,
                            headers: {
                                'content-type': 'application/jose+json'
                            },
                            body: body,
                            json: true
                        },
                        (err, response) => {
                            if (err) { return next(err); }

                            if (response.statusCode !== 200) {
                                return next(new Error('Got error from LE when accepting challenge'));
                            }

                            let nonce = response.headers['replay-nonce'];

                            return next(null, { nonce });
                        });
                    });
                }],
                verifyChallenge: ['challenge', (results, next) => {
                    let nonce = results.challenge.nonce,
                        challenge = _.find(results.authorization.data.challenges, { type: 'http-01' }),
                        payload = '';

                    async.retry({
                        times: 5,
                        interval: (count) => {
                            return 100 * Math.pow(2, count);
                        },
                        errorFilter: (err) => {
                            return err.message === 'Pending';
                        }
                    },
                    (cb) => {
                        let prot = {
                                nonce: nonce,
                                url: challenge.url,
                                kid: results.key.kid
                            },
                            body = JWS.sign.flattened(payload, results.key, prot);

                        this.manager.requester.post({
                            url: challenge.url,
                            headers: {
                                'content-type': 'application/jose+json'
                            },
                            body: body,
                            json: true
                        },
                        (err, response, data) => {
                            if (err) { return cb(err); }

                            if (response.statusCode !== 200) {
                                return cb(new Error('Error verifying challenge from LE'));
                            }

                            nonce = response.headers['replay-nonce'];

                            if (data.status === 'valid') { return cb(); }

                            if (data.status === 'pending' || data.status === 'processing') {
                                return cb(new Error('Pending'));
                            }

                            return cb(new Error('Challenge failed'));
                        });
                    },
                    (err) => {
                        if (err) { return next(err); }

                        return next(null, { nonce });
                    });
                }],
                finalize: ['verifyChallenge', 'csr', (results, next) => {
                    let nonce = results.verifyChallenge.nonce,
                        finalizeUrl = results.order.data.finalize,
                        payload = {
                            csr: results.csr
                        },
                        certificateUrl;

                    async.retry({
                        times: 5,
                        interval: (count) => {
                            return 100 * Math.pow(2, count);
                        },
                        errorFilter: (err) => {
                            return err.message === 'Processing';
                        }
                    },
                    (cb) => {
                        let prot = {
                                kid: results.key.kid,
                                nonce: nonce,
                                url: finalizeUrl
                            },
                            body = JWS.sign.flattened(payload, results.key, prot);

                        this.manager.requester.post({
                            url: results.order.data.finalize,
                            headers: {
                                'content-type': 'application/jose+json'
                            },
                            body: body,
                            json: true
                        },
                        (err, response, data) => {
                            if (err) { return next(err); }

                            if (response.statusCode !== 200) {
                                return next(new Error('Error finalizing order'));
                            }

                            nonce = response.headers['replay-nonce'];
                            certificateUrl = data.certificate;

                            if (data.status === 'valid') { return cb(); }

                            if (data.status === 'processing') {
                                return cb(new Error('Processing'));
                            }

                            return cb(new Error('Error finalizing order'));
                        });
                    },
                    (err) => {
                        if (err) { return next(err); }

                        return next(null, { nonce, certificateUrl });
                    });
                }],
                downloadCertificate: ['finalize', (results, next) => {
                    let payload = '',
                        prot = {
                            kid: results.key.kid,
                            nonce: results.finalize.nonce,
                            url: results.finalize.certificateUrl
                        },
                        body = JWS.sign.flattened(payload, results.key, prot);

                    this.manager.requester.post({
                        url: results.finalize.certificateUrl,
                        headers: {
                            'content-type': 'application/jose+json',
                            accept: 'application/pem-certificate-chain'
                        },
                        body: body,
                        json: true
                    },
                    (err, response, data) => {
                        if (err) { return next(err); }

                        if (response.statusCode !== 200) {
                            return next(new Error('Error while downloading certificate'));
                        }

                        return next(null, data);
                    });
                }],
                formatAndStoreCertificate: ['downloadCertificate', (results, next) => {
                    let regex = /^-+BEGIN\ CERTIFICATE.+END\ CERTIFICATE-+[\n\r]{1}/s,
                        download = results.downloadCertificate,
                        cert,
                        chain,
                        match = download.match(regex),
                        opts = {},
                        pem;

                    cert = match.slice()[0];
                    chain = download.substring(cert.length + 1);

                    cert = cert.trim();
                    chain = chain.trim();

                    pem = {
                        cert,
                        chain
                    };
                    // should this even be store with the certificate?
                    // pem.privkey = results.keypair.privateKeyPem;

                    opts.pem = pem;
                    opts.domain = [domain];
                    opts.email = accountIdentifier;

                    this.manager.store.certificates.set(opts, (err) => {
                        if (err) { return next(err); }

                        return next(null, pems);
                    });
                }]
            },
            (err, results) => {
                if (err) { return done(err); }

                return done(null, results.formatAndStoreCertificate);
            });
        }
    };

module.exports = CertificateManager;

