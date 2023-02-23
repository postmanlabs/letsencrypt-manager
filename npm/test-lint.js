#!/usr/bin/env node
require('shelljs/global');
require('colors');

var async = require('async'),
    ESLintCLIEngine = require('eslint').ESLint,

    /**
     * The list of source code files / directories to be linted.
     *
     * @type {Array}
     */
    LINT_SOURCE_DIRS = [
        './lib',
        './test',
        './npm/*.js',
        './index.js'
    ];

module.exports = function (exit) {
    // banner line
    console.info('\nLinting files using eslint...'.yellow.bold);

    async.waterfall([

        /**
         * Instantiates an ESLint CLI engine and runs it in the scope defined within LINT_SOURCE_DIRS.
         *
         * @param {Function} next - The callback function whose invocation marks the end of the lint test run.
         * @returns {*}
         */
        function (next) {
            next(null, (new ESLintCLIEngine()).lintFiles(LINT_SOURCE_DIRS));
        },

        /**
         * Processes a test report from the Lint test runner, and displays meaningful results.
         *
         * @param {Object} report - The overall test report for the current lint test.
         * @param {Object} report.results - The set of test results for the current lint run.
         * @param {Function} next - The callback whose invocation marks the completion of the post run tasks.
         * @returns {*}
         */
        function (report, next) {
            report.then(async (results) => {
                let errorReport = ESLintCLIEngine.getErrorResults(results),
                    ESLint = new ESLintCLIEngine();

                const formatter = await ESLint.loadFormatter();

                // log the result to CLI
                console.info(formatter.format(results));

                // log the success of the parser if it has no errors
                (errorReport && !errorReport.length) && console.info('eslint ok!'.green);

                // ensure that the exit code is non zero in case there was an error
                return next(Number(errorReport && errorReport.length) || 0);
            })
                .catch((err) => {
                    console.info({
                        error: err,
                        errorType: 'Error parsing promise result',
                        location: 'test-lint.js',
                        function: 'test-lint.js'
                    });
                });
        }
    ], exit);
};

// ensure we run this script exports if this is a direct stdin.tty run
!module.parent && module.exports(exit);
