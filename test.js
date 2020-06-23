const Manager = require('./index');
const request = require('postman-request');
const async = require('async');
const _ = require('lodash');

const Store = {
    create () {
        return {
            accounts: {
                setKeypair (opts, keypair, done) { return done(); },
                checkKeypair (opts, done) { return done(); },
                check (opts, done) { return done(); },
                set (opts, reg, done) { return done(); }
            },
            certificates: {
                setKeypair (opts, keypair, done) { return done(); },
                checkKeypair (opts, done) { return done(); },
                check (opts, done) { return done(); },
                set (opts, done) { return done(); }
            }
        };
    }
};

const Challenge = {
    create () {
        return {
            get (args, domain, token, done) {
                return done();
            },
            set (args, domain, token, secret, done) {
                request.put({
                    url: `https://api.cloudflare.com/client/v4/accounts/476517b9bdc1bbf3f99b1a542b42061c/storage/kv/namespaces/43db20d755044626955821c7dc7612bd/values/${token}`,
                    headers: {
                        'content-type': 'application/json',
                        authorization: 'Bearer hx0u4fRV9c80yfDJ4CqQL31JHzUuD8-8ZMP6TErg'
                    },
                    body: secret
                }, done);
            },
            remove () {}
        };
    }
};

const accStr = '{"keypair":{"privateKeyPem":"-----BEGIN PRIVATE KEY-----\\n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\\n/BM8lUprIIbVOJMtQD4e5ek7K54GuZcS\\n-----END PRIVATE KEY-----\\n","publicKeyPem":"-----BEGIN PUBLIC KEY-----\\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAp71naXT5bei7zZTDjmpG\\nplewbz9QIZvaf+HPDcv9LYFeISlvmvYKcAX8wylFpILKfWA1DfsEB8VuKR2llcpr\\n2ztUYPb6bke3aaz+w6hmKsmguuhxx+miB89641M8m1A4Eo3HOLQqIxQk8kqlKK2Y\\nHfmhVuSeyrNU/bOsn2TOWUOQjgB8+fzAXqwy0PfvIT8w0PYEZk+dfpkIgsntAnYr\\nUkehHYBSzgBMq5b8Z3r49mv13yXd2G0PFHrCBtNuwoeEfNA+cUuG1pOLucba9ZAZ\\nlwXmvzyhXLpY/++Q37meIB5NAqmXCDMV+Z3SkGV76SOJ+SDWYD+INJv8+eEtZ9qc\\nLa1fKxZ/oaWk5UefWsy02B840Us89BjpEH467L8FQEtKuDJn86vnzzUoYD3vM2ZV\\nWrSo4LtncAbDqf71N2M872Hq1RVIwDt7uHjeoDpZSadKvL5c+v3r8opMGseeltXJ\\nXDP2k21lvu+2NeWEU0RX8i/t8rpbHczeya+e3vXrGJytc4Hv4E/f769h+86vTBAM\\nHEv2TiBqJOXtxa1a3iPgFsRbu/B5LfRk+HwLjzCCStVrqbCofDzdY3Sxc49YkgfH\\nyxZDw9yCy2etoZSTowS96iQMbH1uAPLsQ3Zzy1KdOXeqCYKxjPkCDRQuIRu99nNL\\n2hN7mC/JlwIrvQkkwuhY4R0CAwEAAQ==\\n-----END PUBLIC KEY-----","privateKeyJwk":{"e":"AQAB","n":"p71naXT5bei7zZTDjmpGplewbz9QIZvaf-HPDcv9LYFeISlvmvYKcAX8wylFpILKfWA1DfsEB8VuKR2llcpr2ztUYPb6bke3aaz-w6hmKsmguuhxx-miB89641M8m1A4Eo3HOLQqIxQk8kqlKK2YHfmhVuSeyrNU_bOsn2TOWUOQjgB8-fzAXqwy0PfvIT8w0PYEZk-dfpkIgsntAnYrUkehHYBSzgBMq5b8Z3r49mv13yXd2G0PFHrCBtNuwoeEfNA-cUuG1pOLucba9ZAZlwXmvzyhXLpY_--Q37meIB5NAqmXCDMV-Z3SkGV76SOJ-SDWYD-INJv8-eEtZ9qcLa1fKxZ_oaWk5UefWsy02B840Us89BjpEH467L8FQEtKuDJn86vnzzUoYD3vM2ZVWrSo4LtncAbDqf71N2M872Hq1RVIwDt7uHjeoDpZSadKvL5c-v3r8opMGseeltXJXDP2k21lvu-2NeWEU0RX8i_t8rpbHczeya-e3vXrGJytc4Hv4E_f769h-86vTBAMHEv2TiBqJOXtxa1a3iPgFsRbu_B5LfRk-HwLjzCCStVrqbCofDzdY3Sxc49YkgfHyxZDw9yCy2etoZSTowS96iQMbH1uAPLsQ3Zzy1KdOXeqCYKxjPkCDRQuIRu99nNL2hN7mC_JlwIrvQkkwuhY4R0","d":"okCapC6LC16hMtWgZ8SzPDn8J0_l0eyw6RxirSTRbFAD3i33j7xJEl0oRxtICz6cYbRK_Y_-MQovacQMpJzdwX1dPEIKsdvbNXQqJtZgpSjNuZ4YWVjL66QtaXDdYhqxcnkD6PyU-cOFjXzYz0VDrFMIVkXkt4vKPXGsG65lz4CEdmdQfHuZFLqamPoKrG00ahxe2xxN6uRakDCEeuoVM4yn8yJqdmthvmTZF7ui0LJTbZtyQOQVPykTP4kLTU3KwPSqQerdrfego34P1JKjviruLbOXHlv-tOplh5NDuiu1MEsdFchcjEy2HgicWEKRNpMl6onp1YHBrW-7_QZAJHj4NtWMmvSwIgavyMHey8WiLWxIkahOMpWKaHozuaUbsNhgNsxR__1rb-1mbxZZE3ixUWpWvi_lyFN2LYtK-YKiA1J6tE3IubnKbnKePz6eWh9Vaa9_8TImXtO5OTnSQDKrJHDIjg4yG9LPE3m5SYC0Jh0aVaw7E3eO2d44EH-mZK7VgxkjAUYxU7vf22PDBLOeZ3yA7AvxijafrsodldcNYmwxyLueD_bTvhruXJ6thvMdjk-HEnaU6JupCMkoLcLWTBtylWdpVGjvtwV_Q9uqVStZqu8J7uGgBYHmhO3oI26N5Kylpns_e4ovcHP-K5waVz0qDyBiJlDN_HU_7B0","p":"3l1mxsvxXFttrF-q1xj0gtvejkYh2jv8ZTMSqNcoyFBrLTRq5ZsQ12kh9rDVdloiHm6VRHMbkn_RKglgfy2UJsjwD90xjGpup9wfU3FVYEQvz5fGHZQsqkDxeqzSqdBgY8r8Tvp5Zs8-pcgQeww_rOQ9EhGal7Qp-Vx1RQAQyYRHWwsK_4VR2zrBYwzi2QvBxTn0Kptk1zVcqMTUooSb9F_KlJXrRC3LRAaeiBRI7Io4udlIq4zPdJx-qwcSZ9cD9RCIqO9sGiDcdrnuwD2F-FjKTupGxqHFOFahmm2ai8W6zSVdPfk89HN4LcgARIMSnm2ZoD6qSba0vb12aeGWiw","q":"wRzEiM5FTWv95p7R4OTuaVjxJSsiNz8G9UzA2U1FrZvVRK3ajExpRgIYj6xR4Ds2cozYZQksaW0lUwDHKe_IHP0IfuNZswqFqn_6AqqlMSCknVPobG_jChaNsDSkCOf2TiTJC21KmpXUBOfkwVpyxG-CAKCRLINwf2PGjChfnVfD2YsheT7RuWB6v_CMCNy1rzDmf1m54zSOFr8qYcW0EJy50FXY-uu_NTfIVTC8c2TM9UGymaHSGUJYqfNAOQEgDpp_uGiju2Fwkt4kdnyIhQ1n1m2B4mL3LvZtUzIyqj2rbgcp9SsiTLtrgRirE6HdFt2T61UBDj3dy6_eu2cD9w","dp":"X2x9mnoSjau-mOZFDiFrbGymSS_XfyuW2Gbebw5GNhAsri18YiP1SjuXk6G3OR7c3WpfLAypnGi1ffCgNHN-zFYWjvhBNxzFd8uCtfBAzxrz2YYsQq0_raBJAHgBv1Xox2podAwQ5QmyvLnqOKO8_5jCjGp5iPiLurLusDmi-peFd5B5m8W-pvHD45m4D6R39wczvMUKtT_1D4fIKCX4NxqUeMcNOyjbvcmJZqQt1zRJu5d_E_9NV6GAyiwyvdULobMCslxsa5oGgfywdFbykuynhM4MqVjqpY6nsvmuBKVJ0JdkOCApBE45GIxncP8-kjY-YwIBWbjKP1J66l0gmQ","dq":"mvZox5cuiZg1IJElviA3KJZUvAzG4ipTfRhgUH_vgAbitsAD9j2C5MjdyLzw3szlPjrDkyAvYVJSdy7So1Zk8M4juR7bZg71gAI-L1GcSbX2IsGoawvF1tyOSm2TjAoH3mEqa18CVNYSUvV63aWlHviUC8jNdjjrV25Lb0EeqPY6lSFOdSrxxJ4lIkz3Mk1aBgFplZv8zNPpiVtRuS-a9RGvEf0xpvjycNQYkDQRpU-oIM7dcOcn31kcKRSn3paGkPFtuB9P9BeW7GQSQnpgWtSNFMa_SVk9HZRl2jMX8QCXxi09gB1i4swq0mdnMNPcxHJ-NoP52uHOT5sLUrqxtQ","qi":"zOXglUaQDnN52WPstDZNSPiNBfZFi3-eVg0y6jcE6mi72ZfR0PwE7_P8qCcTFFyZ6d5RD6MwAiZ8f5EyHIIvaYYZgS_BT1CMNzAoprwOMRTPbF4otEdphT2aZ-Pxj8RfG5XDNhTUeKLfsUM_o6_b5Ve5ADAs-EpxPDX38BcTyEDP2t_Gu35oyOwpjrhkWidvjjq66L5P1mqKVQouf_GxwOtqcuX_fY9ZSMnOVO10CO2JuIkoc98BSuM1fJwqp5OnGEJl8uoimX01otv0ON837ieaxKajZjHktWPMx5dI_uX-JsgVBOfF1fwTPJVKayCG1TiTLUA-HuXpOyueBrmXEg","kty":"RSA","kid":"xvePq6aD_g2OT9gLPFVVq3-Fg1gcvm6jKIn67FTlD3M","alg":"RS256","use":"sig"},"publicKeyJwk":{"e":"AQAB","n":"p71naXT5bei7zZTDjmpGplewbz9QIZvaf-HPDcv9LYFeISlvmvYKcAX8wylFpILKfWA1DfsEB8VuKR2llcpr2ztUYPb6bke3aaz-w6hmKsmguuhxx-miB89641M8m1A4Eo3HOLQqIxQk8kqlKK2YHfmhVuSeyrNU_bOsn2TOWUOQjgB8-fzAXqwy0PfvIT8w0PYEZk-dfpkIgsntAnYrUkehHYBSzgBMq5b8Z3r49mv13yXd2G0PFHrCBtNuwoeEfNA-cUuG1pOLucba9ZAZlwXmvzyhXLpY_--Q37meIB5NAqmXCDMV-Z3SkGV76SOJ-SDWYD-INJv8-eEtZ9qcLa1fKxZ_oaWk5UefWsy02B840Us89BjpEH467L8FQEtKuDJn86vnzzUoYD3vM2ZVWrSo4LtncAbDqf71N2M872Hq1RVIwDt7uHjeoDpZSadKvL5c-v3r8opMGseeltXJXDP2k21lvu-2NeWEU0RX8i_t8rpbHczeya-e3vXrGJytc4Hv4E_f769h-86vTBAMHEv2TiBqJOXtxa1a3iPgFsRbu_B5LfRk-HwLjzCCStVrqbCofDzdY3Sxc49YkgfHyxZDw9yCy2etoZSTowS96iQMbH1uAPLsQ3Zzy1KdOXeqCYKxjPkCDRQuIRu99nNL2hN7mC_JlwIrvQkkwuhY4R0","kty":"RSA","kid":"xvePq6aD_g2OT9gLPFVVq3-Fg1gcvm6jKIn67FTlD3M","alg":"RS256","use":"sig"}},"receipt":{"accountId":"https://acme-staging-v02.api.letsencrypt.org/acme/acct/14299679"}}'


const account = JSON.parse(accStr);

const options = {
    environment: 'staging',
    challengeType: 'http-01',
    challenges: { 'http-01': Challenge },
    store: Store
};

const manager = new Manager(options);

function getCert (domain, email, done) {
    manager.register(domain, email, true, done);
}

function asyncGetCert (domain, times, done) {
    const asyncStore = {
        create () {
            let store = Store.create();

            store.accounts.check = (opts, done) => {
                return done(null, account);
            }

            return store;
        }
    };

    const asyncOptions = _.assign({ store: asyncStore }, _.omit(options, ['store']));
    const asyncManager = new Manager(asyncOptions);

    async.times(times, function (counter, next) {
        console.log('counter:', counter);
        asyncManager.register(domain, 'letest@elssar.space', true, (err, certs, meta) => {
            console.log('Counter:', counter, Boolean(err), Boolean(certs), Boolean(meta));

            return next(null, { certs, err });
        })
    }, done);
}

function cb (err, result) {
    console.log('done!');
    global.result = { err, result };
}

function done (err, result) {
    console.log('done!');

    global.result = result;
}

module.exports.getCert = getCert;
module.exports.cb = cb;
module.exports.asyncGetCert = asyncGetCert;
module.exports.manager = manager;
module.exports.done = done;

