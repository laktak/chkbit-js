# chkbit

chkbit is a lightweight **bitrot detection tool**.

bitrot (a bit flipping in your data) can occur

- at a low level on the storage media through decay (hdd/sdd)
- at a high level in the os or firmware through bugs

chkbit is independent of the file system and can help you detect bitrot on you primary system, on backups and in the cloud.

## Installation

`npm i chkbit -g`

If you have `md5sum` (Linux/[Windows](http://gnuwin32.sourceforge.net/packages/coreutils.htm)) or `md5` (Mac) in your path it will be used in place of the slower nodejs module.

## Usage

Run `chkbit DIR` to create/update the chkbit index.

chkbit will

- create a `.chkbit` index in every subdirectory of the path it was given.
- update the index with md5 hashes for every file.
- report bitrot for files that rotted since the last run (check the exit status).

```
usage: chkbit [options] path [...]
The options are as follows:
-verify verify without updating the .chkbit files
-force  overwrite inconsistent checksum (repair)
-del    delete all .chkbit files
-p=N    number of parallel operations (default 5)
-i      use node's md5 (ignores -p)
-v      verbose output
Status codes:
'E'     error, md5 mismatch
'a'     add to index
'u'     update md5
' '     not modified (with verbose)
'r'     repair md5 (with force repair)
'?'     unknown (with verify)
```

## Repair

chkbit cannot repair bitrot, its job is simply to detect it.

You should

- backup regularly.
- run chkbit *before* each backup.
- check for bitrot on the backup media.
- in case of bitrot *restore* from a checked backup.

## Ignore files

Add a `.chkbitignore` file containing the names of the files/directories you wish to ignore

- each line should contain exactly one name
- lines starting with `#` are skipped

## FAQ

### Should I run `chkbit` on my whole drive?

You would typically run it only on *content* that you keep for a long time (e.g. your pictures, music, videos).

### Why is chkbit placing the index in `.chkbit` files (vs a database)?

The advantage of the .chkbit files is that

- when you move a directory the index moves with it
- when you make a backup the index is also backed up

The disadvantage is that you get hidden `.chkbit` files in your content folders.

### How does chkbit work?

chkbit operates on files.

When run for the first time it records a md5 hash of the file contents as well as the file modification time.

When you run it again it first checks the modification time,

- if the time changed (because you made an edit) it records a new md5 hash.
- otherwise it will compare the current md5 to the recorded value and report an error if they do not match.

### Can I test if chkbit is working correctly?

On Linux/OS X you can try:

Create test and set the modified time:
```
$ echo foo1 > test; touch -t 201501010000 test
$ chkbit .
a test
$
```
`a` indicates the file was added.

Now update test with a new modified:
```
$ echo foo2 > test; touch -t 201501010001 test # update test & modified
$ chkbit .
u test
$
```

`u` indicates the file was updated.

Now update test with the same modified to simulate bitrot:
```
$ echo foo3 > test; touch -t 201501010001 test
$ chkbit .
E Test
error: detected 1 file(s) with bitrot!
$
```

`E` indicates an error.


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
Removes all index files.
