# chkbit

chkbit is a lightweight bitrot detection tool.

## Installation

`npm i chkbit -g`

You need to have `md5` in your path.

## Usage

Run `chkbit DIR` to create/update the chkbit index.

chkbit will

- create a `.chkbit` index in every subdirectory of the path it was given.
- update the index with md5 hashes for every file.
- report bitrot for files that rotted since the last run (check the exit status).

For other options see the CLI.

## Restore

chkbit cannot repair bitrot, its job is simply to detect it.

You should

- backup regularly.
- run bitchk *before* each backup.
- check for bitrot on the backup media.
- in case of bitrot restore from a checked backup.

## FAQ

### Should I run `chkbit` on my whole drive?

You would typically run it only on *content* that you keep for a long time (e.g. your pictures, music, videos).

### Why is chkbit placing the index in `.chkbit` files (vs a database)?

The advantage of the .chkbit files is that

- when you move a directory the index moves with it
- when you make a backup the index is also backed up

The disadvantage is that you get hidden `.chkbit` files in your content folders.

## API Usage

```
var chkbit=require('../lib/chkbit.js');

var opt={
  status: function(stat, file) { console.log(stat, file); },
  overwrite: false,
  verbose: false,
  readonly: false,
};
```

### verify

```
chkbit.verify(opt, "/path").then(function(res) {
  if (res) console.error("error: detected "+res+" file(s) with bitrot!");
  process.exit(res);
}).catch(...)
```

### delete

```
chkbit.del(opt, "/path").then(function() { console.log("removed."); });
```
