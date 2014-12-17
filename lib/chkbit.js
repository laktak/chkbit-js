// chkbit - bitrot detection tool
// Copyright (c) 2014 Christian Zangl, see LICENSE file

var Promise=require("bluebird"); // use bluebird promises, es6-shim is buggy
require("es6-shim"); // es6 support
var child_process=require("child_process");
var crypto=require("crypto");
var fs2=require("fs");
var fs=require("promised-io/fs");
var path=require("path");
var util=require("util");
var version=require("../package.json").version;

function flattenArrays(arrayOfArrays) {
  return arrayOfArrays.reduce(function(x, y) { return x.concat(y); }, []);
}

var limiter=function(max) {
  var active=0, pending=[];
  if (max<1) max=1;

  function next() {
    active--;
    if (active<0) throw new Error("active<0!");
    if (pending.length>0) process.nextTick(pending.shift());
  }

  return function(pcb) {
    return new Promise(function run(resolve, reject) {
      if (active>max) { pending.push(run.bind(null, resolve, reject)); return; }
      active++;
      try {
        pcb(function(res) { next(); resolve(res); }, function(err) { next(); reject(err); });
      } catch (err) { next(); reject(err); }
    });
  };
};

var limit=limiter(10);

function exec(dir, bin, args) {
  return limit(function(resolve, reject) {
    var p=child_process.spawn(bin, args, { stdio: "pipe", cwd: dir });
    var out="", outErr="", doNext=true;
    p.stderr.on("data", function(chunk) { outErr+=chunk.toString(); });
    p.stdout.on("data", function(chunk) { out+=chunk.toString(); });
    p.on("error", function (err) {
      reject(new Error(bin+JSON.stringify(args)+" failed: "+err.message));
    });
    p.on("close", function (code) {
      if (code) reject(new Error(bin+JSON.stringify(args)+" failed with exit code: "+code));
      else resolve(out);
    });
  });
}

function md5(opt, file) {
  if (module.exports.useNativeMd5) {
    switch (process.platform) {
      case "darwin":
        return exec(process.cwd(), "md5", [ "-q", file ]).then(function(text) { return text.split("\n")[0]; });
      default:
        return exec(process.cwd(), "md5sum", [ "-b", file ]).then(function(text) { return text.split(" ")[0]; });
    }
  } else {
    return limit(function(resolve, reject) {
      var md5=crypto.createHash("md5");
      var s=fs2.ReadStream(file);
      s.on("data", function(d) { md5.update(d); });
      s.on("end", function() { resolve(md5.digest("hex")); });
      s.on("error", function(err) { reject(err); }); });
  }
}

function md5x(text) {
  var md5=crypto.createHash("md5");
  md5.update(text, "utf8");
  return md5.digest("hex");
}

function idxName(dir) {
  return path.join(dir, ".chkbit");
}

function idxSave(dir, data) {
  data=JSON.stringify(data);
  return fs.writeFile(idxName(dir), JSON.stringify({
    data: data,
    md5: md5x(data).toString(),
    ts: Date.now(),
    v: version,
  }), "utf8");
}

function idxLoad(opt, dir) {
  var file=idxName(dir);
  if (fs.existsSync(file)) {
    return Promise.resolve(fs.readFile(file, "utf8"))
    .then(function(text) {
      var data=JSON.parse(text);
      if (!data.ts) {} // ignore md5 package bug in v1.0.0
      else if (md5x(data.data).toString()!==data.md5) throw Error(dir+" incorrect index checksum!");
      return JSON.parse(data.data);
    }).catch(function(err) {
      if (opt && opt.overwrite) return [];
      else throw Error(dir+": "+err.message);
    });
  } else return [];
}

function idxDel(dir) {
  var file=idxName(dir);
  // fs.exists(file) appears to be buggy
  return fs.existsSync(file)?fs.unlink(file).then(function(){ return 1; }):Promise.resolve(0);
}

function getDir(dir) {
  return fs.readdir(dir).then(function(list) {
    var files=[], dirs=[];
    list.forEach(function(name) {
      if (name[0]==="." || name[0]==="~") return;
      var file=path.join(dir, name);
      var stats=fs.statSync(file);
      if (stats.isDirectory()) dirs.push(name);
      else files.push({ name: name, mod: stats.mtime.getTime() });
    });
    return { path: dir, files: files, dirs: dirs };
  });
}

function calc(opt, dirInfo) {
  return Promise.all(dirInfo.files.map(function(fileInfo) {
    return md5(opt, path.join(dirInfo.path, fileInfo.name))
    .then(function(res) { return { name: fileInfo.name, mod: fileInfo.mod, md5: res }; });
  }));
}

function verify(opt, dir) {
  var res=0, wait=getDir(dir);
  return Promise.all([
    Promise.all([wait.then(calc.bind(null, opt)), idxLoad(opt, dir)])
    .then(function(all) {
      var current=all[0], idx=all[1];
      current.forEach(function(item) {
        var file=path.join(dir, item.name);
        var old=idx.find(function(x) { return x.name===item.name; });
        if (old) {
          if (item.md5!==old.md5) {
            if (item.mod===old.mod) {
              if (!opt.overwrite) { item.md5=old.md5; opt.status("E", file); res++; }
              else opt.status("r", file);
            }
            else opt.status("u", file);
          }
          else if (opt.verbose) opt.status(" ", file);
        }
        else opt.status(opt.readonly?"?":"a", file);
      });
      return current;
    })
    .then(function(data) { if (!opt.readonly) return idxSave(dir, data); }),
    wait.then(function(dirInfo) {
      return Promise.all(dirInfo.dirs.map(function(sub) { return verify(opt, path.join(dir, sub)); }))
      .then(function(all) { all.forEach(function(x) { res+=x; }); });
    }),
  ]).then(function() { return res; });
}

function del(opt, dir) {
  return Promise.all([
    idxDel(dir).then(function(res) {
      if (res && opt.verbose) opt.status("d", dir);
      return [res];
    }),
    getDir(dir).then(function(dirInfo) {
      return Promise.all(dirInfo.dirs.map(function(sub) { return del(opt, path.join(dir, sub)); }));
    }),
  ])
  .then(flattenArrays).then(function(all) { return all.reduce(function(sum, x) { return sum+x; }); });
}

module.exports={
  verify: verify,
  del: del,
  setMaxParallel: function(max) { limit=limiter(max); },
  useNativeMd5: true,
  version: version,
};

require("find-in-path")(process.platform==="darwin"?"md5":"md5sum", function(err, path) {
  module.exports.useNativeMd5=!!path;
});
