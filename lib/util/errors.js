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
    constructor (message, options = {}) {
        let { response } = options;

        if (_.isPlainObject(response)) {
            delete options.response;

            let { statusCode } = response,
                { type: error, detail, status: orderStatus } = _.get(response, 'data', {}),
                friendlyError = error && error.split ? error.split(':').pop() : undefined;

            options.acme = _.pickBy({
                error,
                friendlyError,
                detail,
                statusCode,
                orderStatus
            }, _.identity);
        }

        super(message, options);
    }
}

module.exports = {
    LCMError,
    AcmeError
};

