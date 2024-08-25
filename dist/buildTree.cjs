#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

/**
 * CommonJS does not have top-level `await`, so we can wrap
 * everything in an `async` IIFE to make our lives a little easier.
 */
(async function () {
    const { SaplingParser } = await import("./tree/SaplingParser.mjs");
    const { glob } = require("glob");
    const path = require("path");
    const fs = require("fs");
    const {
        transpileTypescript,
        getComponentPathExtension,
        getStoryMetadata,
        getBarrelFileComponentPath,
        editGetDependenciesTree,
    } = require("./utils/buildTreeUtils.cjs");

    // Determine the base path for globbing based on environment variable
    const storybookStoriesPath = process.env.STORYBOOK_STORIES_PATH;

    // If environment variable is set, use it; otherwise, use the default behavior
    const globPattern = storybookStoriesPath
        ? [`${storybookStoriesPath}/**/*.stories.@(js|jsx|ts|tsx|mdx)`]
        : ["**/[A-Z]*.stories.*"];

    // Perform the glob search based on the determined pattern
    const tsfiles = await glob(globPattern, {
        ignore: ["**/node_modules/**"],
        windowsPathsNoEscape: true,
    });

    // If using environment variable path, resolve relative to the provided path; otherwise, use default resolution
    const tspaths = storybookStoriesPath
        ? tsfiles.map((relativePath) => path.resolve(storybookStoriesPath, relativePath))
        : tsfiles.map((relativePath) => path.resolve(relativePath));

    let storiesComponents = {};

    const searchStory = (filePath) => {
        return storiesComponents[filePath];
    };

    for (const storyPath of tspaths) {
        try {
            const fileContent = fs.readFileSync(storyPath, "utf-8");
            const fileString = transpileTypescript(fileContent);
            const { title, relativeComponentPath } = getStoryMetadata(fileString);
            const componentPath = path.resolve(path.dirname(storyPath), relativeComponentPath); // Correct resolution
            storiesComponents[getComponentPathExtension(componentPath)] = title;
        } catch (error) {
            console.error(`Error processing story path: ${storyPath}`);
            console.error(error);
        }
    }

    const dependenciesRecursive = (node) => {
        const children = node.children;
        if (children.length === 0) return [];
        const dependencies = children.map((child) => {
            const title = child.error
                ? searchStory(getBarrelFileComponentPath(child.name, child.filePath))
                : searchStory(child.filePath);
            if (!!title) {
                dependentsRecursive(title, child);
                return title;
            }
            return dependenciesRecursive(child);
        });
        return dependencies.flat();
    };

    const dependentsRecursive = (nodeTitle, node) => {
        if (!node.parent) return;
        const parentTitle = searchStory(node.parent.filePath);
        if (!parentTitle) {
            return dependentsRecursive(nodeTitle, node.parent);
        }
        const rootNode = getRootNode(nodeTitle);
        rootNode.dependents.push(parentTitle);
    };

    let tree = {};
    const getRootNode = (title) => {
        if (!tree[title]) {
            tree[title] = { dependencies: [], dependents: [] };
        }
        return tree[title];
    };

    for (const componentPath in storiesComponents) {
        const title = storiesComponents[componentPath];
        const rootNode = getRootNode(title);
        rootNode.dependencies = dependenciesRecursive(SaplingParser.parse(componentPath));
    }

    editGetDependenciesTree(tree);
})();
