// chkbit - bitrot detection tool
// Copyright (c) 2014 Christian Zangl, see LICENSE file

var path=require("path");
var child_process=require("child_process");
var util=require("util");
var _=require("lodash");
var Promise=require("bluebird");
var fs=require("promised-io/fs");
var md5js=require("md5")

var exec=(function() {
  var concurrent=0, limit=20, pending=[];

  function next() {
    concurrent--;
    if (concurrent<0) throw new Error("concurrent<0!");
    if (pending.length>0) pending.shift()();
  }

  return function(dir, bin, args) {
    function run(resolve, reject) {
      if (concurrent>limit) { pending.push(run.bind(null, resolve, reject)); return; }
      concurrent++;
      var p=child_process.spawn(bin, args, { stdio: "pipe", cwd: dir });
      var out="", outErr="", doNext=true;
      p.stderr.on("data", function(chunk) { outErr+=chunk.toString(); });
      p.stdout.on("data", function(chunk) { out+=chunk.toString(); });
      p.on("error", function (err) {
        if (doNext) { doNext=false; next(); }
        reject(new Error(bin+JSON.stringify(args)+" failed: "+err.message));
      });
      p.on("close", function (code) {
        if (doNext) { doNext=false; next(); }
        if (code) reject(new Error(bin+JSON.stringify(args)+" failed with exit code: "+code));
        else resolve(out);
      });
    }
    return new Promise(run);
  };
})();

function md5(file) {
  return exec(process.cwd(), "md5", [ "-q", file ]).then(function(text) { return text.split("\n")[0]; });
}

function idxName(dir) {
  return path.join(dir, ".chkbit");
}

function idxSave(dir, data) {
  data=JSON.stringify(data);
  return fs.writeFile(idxName(dir), JSON.stringify({
    data: data,
    md5: md5js.digest_s(data),
  }), "utf8");
}

function idxLoad(opt, dir) {
  var file=idxName(dir);
  if (fs.existsSync(file)) {
    return Promise.resolve(fs.readFile(file, "utf8"))
    .then(function(text) {
      var data=JSON.parse(text);
      if (md5js.digest_s(data.data)!==data.md5) throw Error(dir+" incorrect index checksum!");
      return JSON.parse(data.data);
    }).catch(function(err) {
      if (opt && opt.overwrite) return {};
      else throw Error(dir+": "+err.message);
    });
  } else return {};
}

function idxDel(dir) {
  var file=idxName(dir);
  if (fs.existsSync(file)) fs.unlink(file);
}

function getDir(dir) {
  return fs.readdir(dir).then(function(list) {
    var files=[], dirs=[];
    _.each(list, function(name) {
      if (name[0]==="." || name[0]==="~") return;
      var file=path.join(dir, name);
      var stats=fs.statSync(file);
      if (stats.isDirectory()) dirs.push(name);
      else files.push({ name: name, mod: stats.mtime.getTime() });
    });
    return { path: dir, files: files, dirs: dirs };
  });
}

function calc(dirInfo) {
  return Promise.all(_.map(dirInfo.files, function(fileInfo) {
    return md5(path.join(dirInfo.path, fileInfo.name))
    .then(function(res) { return { name: fileInfo.name, mod: fileInfo.mod, md5: res }; });
  }));
}

function verify(opt, dir) {
  var res=0, wait=getDir(dir);
  return Promise.all([
    Promise.all([wait.then(calc), idxLoad(opt, dir)])
    .then(function(all) {
      var current=all[0], idx=all[1];
      _.each(current, function(item) {
        var file=path.join(dir, item.name);
        var old=_.find(idx, function(x) { return x.name===item.name; });
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
      return Promise.all(_.map(dirInfo.dirs, function(sub) { return verify(opt, path.join(dir, sub)); }))
      .then(function(all) { _.each(all, function(x){res+=x;}); });
    }),
  ]).then(function() { return res; });
}

function del(opt, dir) {
  if (opt.verbose) console.log(dir);
  idxDel(dir);
  return getDir(dir).then(function(dirInfo) {
    return Promise.all(_.map(dirInfo.dirs, function(sub) { return del(opt, path.join(dir, sub)); }));
  });
}

module.exports={
  verify: verify,
  del: del,
};
