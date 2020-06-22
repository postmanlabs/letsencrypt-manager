const { pki } = require('node-forge'),
    { JWK } = require('jose');

function generateKey () {
    return JWK.generateSync('RSA', 4096, { use: 'sig', alg: 'RS256' });
}

function formatKey (key) {
    return {
        privateKeyPem: key.toPEM(true),
        publicKeyPem: key.toPEM(false),
        privateKeyJwk: key.toJWK(true),
        publicKeyJwk: key.toJWK(false)
    };
}

function jwkToKey (jwk) {
    return JWK.asKey(jwk);
}

function _urlSafeDer (der) {
    return Buffer.from(der.bytes(), 'binary')
        .toString('base64')
        .replace(/[=]/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function generateCSR (privateKeyPem, publicKeyPem, domain) {
    let privateKey = pki.privateKeyFromPem(privateKeyPem),
        publicKey = pki.publicKeyFromPem(publicKeyPem),
        csr = pki.createCertificationRequest(),
        pem,
        der;

    csr.publicKey = publicKey;
    csr.setSubject([
        {
            name: 'commonName',
            value: domain
        }
    ]);

    csr.setAttributes([
        {
            name: 'extensionRequest',
            extensions: [
                {
                    name: 'subjectAltName',
                    altNames: [
                        {
                            type: 2,
                            value: domain
                        }
                    ]
                }
            ]
        }
    ]);

    csr.sign(privateKey);
    pem = pki.certificationRequestToPem(csr);
    der = pki.pemToDer(pem);

    return _urlSafeDer(der);
}

module.exports = {
    generateKey,
    formatKey,
    jwkToKey,
    generateCSR
};

