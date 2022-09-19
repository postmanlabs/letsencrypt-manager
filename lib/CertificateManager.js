const _ = require('lodash'),
    async = require('async'),
    moment = require('moment'),
    { pki } = require('node-forge'),

    Order = require('./Order'),
    { generateKey, formatKey, generateCSR } = require('./util/crypto'),
    { LCMError } = require('./util/errors');

class CertificateManager {
    constructor (manager) {
        this.manager = manager;
    }

    static getCertificateExpiry (certificate) {
        let pem = pki.certificateFromPem(certificate);

        return moment.utc(pem.validity.notAfter);
    }

    static certificateRequiresRenewal (certificate, validityThreshold) {
        let expiry = CertificateManager.getCertificateExpiry(certificate);

        return expiry.diff(moment.utc(), 'd') < validityThreshold;
    }

    static formatDownloadedCertificate (downloadedCertificate) {
        let regex = /^-+BEGIN CERTIFICATE[\s\S]+-+END CERTIFICATE-+[\n\r]{1}/,
            certificate,
            chain,
            match;

        downloadedCertificate = downloadedCertificate.trim();
        match = downloadedCertificate.match(regex);

        certificate = match.slice()[0];
        chain = downloadedCertificate.substring(certificate.length + 1);

        return {
            certificate: certificate.trim(),
            chain: chain.trim()
        };
    }

    get (domain, email, tnc, done) {
        this.manager.store.certificates.check({ domains: [domain] }, (err, certificate) => {
            if (err) { return done(err); }

            if (!certificate) {
                return this.register(domain, email, tnc, (err, issuedCertificate) => {
                    if (err) { return done(err); }

                    return done(null, issuedCertificate, {
                        issued: true,
                        renewed: false
                    });
                });
            }

            let renew;

            try {
                renew = CertificateManager.certificateRequiresRenewal(certificate.cert, 30);
            }
            catch (certificateParseError) {
                return done(new LCMError('Error parsing certificate', {
                    domain
                }));
            }

            if (renew) {
                return this.register(domain, email, tnc, (err, renewedCertificate) => {
                    if (err) { return done(err); }

                    return done(null, renewedCertificate, {
                        issued: true,
                        renewed: true
                    });
                });
            }

            return done(null, _.pick(certificate, ['cert', 'chain', 'privkey']), { issued: false, renewed: false });
        });
    }

    _getKeypair (domain, email, done) {
        this.manager.store.certificates.checkKeypair({ domains: [domain] }, (err, keypair) => {
            if (err) { return done(err); }

            if (keypair) { return done(null, keypair); }

            let generatedKeypair = formatKey(generateKey());

            this.manager.store.certificates.setKeypair({
                domains: [domain],
                email: email
            }, generatedKeypair,
            (keypairStoreErr) => {
                if (keypairStoreErr) { return done(err); }

                return done(null, generatedKeypair);
            });
        });
    }

    register (domain, email, tos, done) {
        async.auto({
            keypair: (next) => {
                this._getKeypair(domain, email, next);
            },
            account: (next) => {
                this.manager.accountsManager.getAccount(email, tos, next);
            },
            csr: ['keypair', (results, next) => {
                let { privateKeyPem, publicKeyPem } = results.keypair;

                return next(null, generateCSR(privateKeyPem, publicKeyPem, domain));
            }],
            order: ['csr', 'account', (results, next) => {
                let order = new Order(results.account, domain, results.csr, this.manager.requester, {
                    type: this.manager.challengeType,
                    manager: this.manager.challengeManager
                });

                order.procure((err, downloadedCertificate) => {
                    if (err) { return next(err); }

                    return next(null, CertificateManager.formatDownloadedCertificate(downloadedCertificate));
                });
            }],
            store: ['order', (results, next) => {
                this.manager.store.certificates.set({
                    pems: {
                        cert: results.order.certificate,
                        chain: results.order.chain,
                        privkey: results.keypair.privateKeyPem
                    },
                    domains: [domain],
                    email: email
                }, next);
            }]
        },
        (err, results) => {
            if (err) { return done(err); }

            let { chain, certificate: cert } = results.order,
                { privateKeyPem: privkey } = results.keypair;

            return done(null, { chain, cert, privkey });
        });
    }
}

module.exports = CertificateManager;

