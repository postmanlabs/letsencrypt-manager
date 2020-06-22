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
                data = _.get(response, 'data', {}),
                errorObject = data.error || data,
                { type: error, detail, status: orderStatus, subproblems: subProblems } = errorObject,
                friendlyError = error && error.split ? error.split(':').pop() : undefined;

            options.acme = _.pickBy({
                error,
                friendlyError,
                detail,
                subProblems,
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

