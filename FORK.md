# 42 React distribution

This branch contains the installable React package built from source commit
[`185e28a5d50e642d18777f02259425075ce86fa1`](https://github.com/42technologies/headlessui/commit/185e28a5d50e642d18777f02259425075ce86fa1)
on `fix/combobox-option-batching` in this repository. It includes both combobox
registration batching and the flush before Enter selection.

Consumers should pin a full commit SHA of this distribution branch. The normal
package exports resolve to `dist/` for ESM, CommonJS, and TypeScript declarations.
No build or install scripts run in consumers.

## Rebuild

In a source checkout:

```sh
git checkout 185e28a5d50e642d18777f02259425075ce86fa1
npm ci
npm run build --workspace=@headlessui/react
npm pack --workspace=@headlessui/react --ignore-scripts --pack-destination /tmp
```

Extract the resulting tarball into a clean distribution worktree with
`tar -xzf /tmp/headlessui-react-2.2.10.tgz --strip-components=1`.
Keep the upstream package exports and dependencies. Rename the package to
`@42technologies/headless-react`, set its fork version, point the repository URL
to this fork, and set `gitHead` to the source commit. Remove `scripts`,
`devDependencies`, and `publishConfig`: their source build tools are not included
in the distribution. Preserve this file and update its source commit.

Commit and push the distribution, then update the app dependency to that new
full commit SHA and regenerate `yarn.lock`. Do not change source files here;
make fixes on the source branch and rebuild.
