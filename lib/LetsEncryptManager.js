const _ = require('lodash'),
    { isEmail, isFQDN } = require('validator'),

    AccountsManager = require('./AccountsManager'),
    CertificateManager = require('./CertificateManager'),

    Requester = require('./util/requester'),
    { LCMError } = require('./util/errors'),

    LE_ENVIRONMENTS = {
        staging: {
            directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory'
        },
        production: {
            directoryUrl: 'https://acme-v02.api.letsencrypt.org/directory'
        }
    },

    DEFAULT_ENVIRONMENT = 'staging';

class LetsEncryptManager {
    constructor (options) {
        this.environment = _.get(LE_ENVIRONMENTS, options.environment, LE_ENVIRONMENTS[DEFAULT_ENVIRONMENT]);
        this.directoryUrl = options.directoryUrl || this.environment.directoryUrl;

        this.requester = new Requester({ directoryUrl: this.directoryUrl });

        this.challengeType = options.challengeType || 'http-01';

        this.accountsManager = new AccountsManager(this);
        this.certificateManager = new CertificateManager(this);

        this.store = options.store.create();
        this.challengeManager = options.challenges[this.challengeType].create();
    }

    register (domain, email, tnc, done) {
        if (!isFQDN(domain)) {
            return done(new LCMError('Invalid domain', {
                domain
            }));
        }

        if (!isEmail(email)) {
            return done(new LCMError('Invalid email', {
                email
            }));
        }

        if (tnc !== true) {
            return done(new LCMError('Terms not accepted'));
        }

        this.certificateManager.get(domain, email, tnc, done);
    }

    middleware () {
        const PREFIX = '/.well-known/acme-challenge/',
            ChallengeManager = this.challengeManager;

        return function (req, res, next) {
            if (!req.url.startsWith(PREFIX)) {
                return next();
            }

            let split = req.url.split('/'),
                token = split.pop(),
                hostname = req.hostname;

            // if the url ends with a /
            // unlikely, but still
            if (!token) { token = split.pop(); }

            // token not found, let the service deal with the request
            if (!token) { return next(); }

            ChallengeManager.get({}, hostname, token, (err, challenge) => {
                if (err) {
                    res.set('content-type', 'text/plain; charset=utf8');
                    res.status(500);

                    return res.send('Something went wrong');
                }

                if (!challenge) {
                    res.set('content-type', 'text/plain; charset=utf8');
                    res.status(404);

                    return res.send('Not found');
                }

                res.set('content-type', 'application/octet-stream');
                res.status(200);

                return res.send(challenge);
            });
        };
    }
}

module.exports = LetsEncryptManager;

