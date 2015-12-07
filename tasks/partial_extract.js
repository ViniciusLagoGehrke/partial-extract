/*
 * grunt-partial-extract
 * https://github.com/tilmanjusten/grunt-partial-extract
 *
 * Copyright (c) 2015 Tilman Justen
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks

    var util = require('util');
    var _ = require('lodash');
    var path = require('path');
    var options = {};
    var InventoryObject = require('./../lib/inventory-object');

    grunt.registerMultiTask('partial-extract', 'Extract partials from any text based files and write json inventory file.', function () {
        // Merge task-specific and/or target-specific options with these defaults.
        options = this.options({
            // Find partials by pattern:
            //
            // <!-- extract:individual-file.html optional1:value optional2:value1:value2 -->
            //   partial
            // <!-- endextract -->
            patternExtract: new RegExp(/<!--\s*extract:(.|\n)*?endextract\s?-->/g),
            // Wrap partial in template element and add options as data attributes
            templateWrap: {
                before: '<template id="partial" {{wrapData}}>',
                after:  '</template>'
            },
            // Wrap component for viewing purposes: e.g. add production context
            //
            // <!-- extract:individual-file.html wrap:<div class="context">:</div> -->
            //   partial
            // <!-- endextract -->
            //
            // results in
            //
            // <div class="context">
            //   partial
            // </div>
            viewWrap: {
                before: '',
                after: ''
            },
            // Base directory
            base: './inventory',
            // Partial directory where individual partial files will be stored (relative to base)
            partials: './partials',
            // Store inventory data as JSON file
            storage: 'partial-extract.json',
            // Enable storing partials as individual files
            storePartials: false,
            // Set indent value of partial code
            indent: '    '
        });

        grunt.log.writeln('Destination: ' + options.base);
        grunt.verbose.writeln('Files: ' + this.files.length);
        grunt.log.writeln('');

        var processedBlocks = {
            options: options,
            length: 0,
            items: []
        };
        var uniqueBlocks = [];

        // Iterate over all specified file groups.
        this.files.forEach(function (file) {
            var content = grunt.util.normalizelf(grunt.file.read(file.src));

            if (!options.patternExtract.test(content)) {
                grunt.log.errorlns('No partials in file ' + file.src);
                grunt.verbose.writeln('');

                return;
            }

            var blocks = getPartials(content);
            var resources = getResources(content, file.src);

            // put resources to the options
            options.resources = options.resources ? _.assign({}, resources, options.resources) : resources;

            grunt.log.oklns('Found ' + blocks.length + ' partials in file ' + file.src);

            // Write blocks to separate files
            blocks.map(function (block) {
                // init inventory object
                var opts = _.assign({}, options);
                var processed = new InventoryObject();
                var isDuplicate = false;

                // process block
                processed.parseData(block, opts);
                processed.setProperty('origin', file.dest);

                processedBlocks.items.push(processed);

                if (uniqueBlocks.indexOf(processed.id) < 0) {
                    uniqueBlocks.push(processed.id);
                } else {
                    isDuplicate = true;
                }

                // store partial if not already happen
                if (options.storePartials && !isDuplicate) {
                    grunt.file.write(path.resolve(options.base, options.partials, processed.id), processed.template);
                }
            });

            grunt.verbose.writeln('');
        });

        processedBlocks.lengthUnique = uniqueBlocks.length;
        processedBlocks.lengthTotal = processedBlocks.items.length;

        grunt.file.write(options.storage, JSON.stringify(processedBlocks, null, '\t'));

        grunt.log.writeln('');

        grunt.log.oklns('Extracted ' + processedBlocks.length + ' partials, ' + uniqueBlocks.length + ' unique.');
    });

    /**
     * extract partials
     *
     * @param src
     * @returns {Array}
     */
    function getPartials(src) {
        return src.match(options.patternExtract);
    }

    /**
     * extract resource path of
     * - javascript resources in <head> and <body>
     * - stylesheet resources in <head>
     * - <style> in <head>
     * - <meta> in <head>
     * - classnames of <body>
     * - classnames of <html>
     *
     * @param src
     * @param filepath
     */
    function getResources(src, filepath) {
        var head = src.match(/<head((.|\n)*)<\/head>/i)[1];
        var body = src.match(/<body((.|\n)*)<\/body>/i)[1];
        var rootClassnames = src.match(/<html.+class="([^"]*)">/i);
        var bodyClassnames = src.match(/<body.+class="([^"]*)">/i);

        // defaults
        var data = {
            classnames: {
                root: rootClassnames && rootClassnames.length ? rootClassnames[1] : '',
                body: bodyClassnames && bodyClassnames.length ? bodyClassnames[1] : ''
            },
            meta: [],
            scriptsFoot: {
                files: [],
                inline: []
            },
            scriptsHead: {
                files: [],
                inline: []
            },
            stylesHead: {
                files: [],
                inline: []
            }
        };

        // <head> section
        if (head && head.length > 0) {
            // stylesheet resources
            data.stylesHead.files = getStylesheetResources(head);

            // inline styles
            data.stylesHead.inline = getInlineStyles(head);

            // script resources
            data.scriptsHead.files = getScriptResources(head);

            // inline scripts, get script tags without src: <script> or <script type="xyz">, lazy mode
            data.scriptsHead.inline = getInlineScripts(head);

            // <meta>
            data.meta = head.match(/<meta[^>]+>/ig);
        }

        // <body> section
        if (body && body.length) {
            data.scriptsFoot.files = getScriptResources(body);
            data.scriptsFoot.inline = getInlineScripts(body);
        }

        return data;
    }

    /**
     * get paths of stylesheet resources
     *
     * @param src
     * @returns {Array}
     */
    function getStylesheetResources(src) {
        var resources = src.match(/<link.+rel="stylesheet".*>/gi);

        if (!resources || (resources && resources.length < 1)) {
            return [];
        }

        return resources.map(function (match) {
            return match.match(/href="([^"]+)"/i)[1];
        });
    }

    /**
     * get inline styles
     *
     * @param src
     * @returns {Array}
     */
    function getInlineStyles(src) {
        var resources = src.match(/<style[^>]*?>((.|\n)*?)<\/style>/gi);

        if (!resources || (resources && resources.length < 1)) {
            return [];
        }

        return resources.map(function (match) {
            return match.match(/<style[^>]*>((.|\n)*)<\/style>/i)[1];
        });
    }

    /**
     * get paths of script resources
     *
     * @param src
     * @returns {Array}
     */
    function getScriptResources(src) {
        var resources = src.match(/<script.+src=".*>/gi);

        if (!resources || (resources && resources.length < 1)) {
            return [];
        }

        return resources.map(function (match) {
            return match.match(/src="([^"]+)"/i)[1];
        });
    }

    /**
     * get inline scripts
     *
     * @param src
     * @returns {Array}
     */
    function getInlineScripts(src) {
        var resources = src.match(/<script(?:.+type="[^"]+")?>((.|\n)*?)<\/script>/gi);

        if (!resources || (resources && resources.length < 1)) {
            return [];
        }

        return resources.map(function (match) {
            return match.match(/<script[^>]*>((.|\n)*)<\/script>/i)[1];
        });
    }
};
