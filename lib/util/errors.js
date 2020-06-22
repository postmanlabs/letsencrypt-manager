const _ = require('lodash');

class LCMError extends Error {
    constructor (message, options) {
        super(message);
        this.name = this.constructor.name;
        this.options = options;

        Error.captureStackTrace(this, this.constructor);
    }
}

class AcmeError extends LCMError {
    constructor (message, responseCode, data = {}) {
        let { type = '', detail = '', status } = data,
            friendly = type.split(':').pop();

        message = _.isString(detail) ? `[${friendly || type}] ${detail}` : message;
        super(message, {
            type,
            friendly,
            detail,
            status,
            responseCode
        });
    }
}

module.exports = {
    LCMError,
    AcmeError
};

