const fs = require('fs');
const os = require('os');
const { spawn, exec } = require("child_process")
const iconv = require('iconv-lite')
const { clipboard } = require('electron')
const robot = require('./robotjs')

//-------checkUpdate------
const path = require("path")
const { dialog, BrowserWindow, nativeImage } = require('electron').remote
const { shell } = require('electron');

pluginInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin.json')));
logo = nativeImage.createFromPath(path.join(__dirname, 'logo.png'));

messageBox = (options, callback) => {
    dialog.showMessageBox(BrowserWindow.getFocusedWindow(), options, index => {
        callback(index);
    })
}

open = url => {
    shell.openExternal(url);
}
// ------------------------

isWin = os.platform() == 'win32' ? true : false;

isDev = /unsafe-\w+\.asar/.test(__dirname) ? false : true

basename = path.basename;

dirname = __dirname;

pjoin = path.join;

exists = fs.existsSync;

getIconPath = name => {
    let dir = path.resolve(__dirname, '..', 'QuickCommandIcons')
    if (!exists(dir)) fs.mkdirSync(dir);
    return `../QuickCommandIcons/${name}`
}

getBase64Ico = path => {
    return fs.readFileSync(path, 'base64');
}

saveBase64Ico = (path, b64) => {
    fs.writeFileSync(path, b64, 'base64');
}

openFolder = () => {
    return dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
        buttonLabel: '选择',
        filters: [
          {name: 'Images', extensions: ['jpg', 'jpeg', 'png']},
        ]
    });
}

copy = () => {
    var ctlKey = isWin ? 'control' : 'command';
    robot.keyTap('c', ctlKey);
    robot.setKeyboardDelay(20);
}

copyTo = text => {
    clipboard.writeText(text)
}

paste = () => {
    var ctlKey = isWin ? 'control' : 'command';
    robot.keyTap('v', ctlKey);
}

getSelectText = () => {
    copy();
    return clipboard.readText()
}

getSelectFile = () => {
    copy();
    var filePath;
    if (isWin) {
        filePath = clipboard.readBuffer('FileNameW').toString('ucs2');
        filePath = filePath.replace(new RegExp(String.fromCharCode(0), 'g'), '');
    } else {
        filePath = clipboard.read('public.file-url').replace('file://', '');
    }
    return filePath;
}

getAddr = () => {
    robot.keyTap('d', 'alt');
    robot.setKeyboardDelay(10);
    return getSelectText().replace(/\\/g, '/');
}

pwd = () =>
    new Promise((reslove, reject) => {
        if (isWin) {
            var addr = getAddr();
            if (!exists(addr)) addr = `${os.homedir().replace(/\\/g, '/')}/Desktop`;
            reslove(addr);
        } else {
            var cmd = `osascript -l JavaScript -e '
            const frontmost_app_name = Application("System Events").applicationProcesses.where({ frontmost: true }).name()[0]
            if (frontmost_app_name === "Finder") {
              unescape(Application("Finder").insertionLocation().url()).slice(7).slice(0, -1)
            } else if(frontmost_app_name === "Path Finder") {
              unescape(Application("Path Finder").finderWindows[0].target.url()).slice(7).slice(0, -1)
            } else {
              unescape(Application("Finder").desktop.url()).slice(7).slice(0, -1)
            }
          '`
            exec(cmd, (err, stdout, stderr) => {
                if (err) reject(stderr)
                reslove(stdout.trim());
            });
        }
    });

chromeUrl = () =>
    new Promise((reslove, reject) => {
        if (isWin) {
            reslove(getAddr());
        } else {
            var cmd = `osascript  -e 'tell application "Google Chrome"
                        get URL of active tab of window 1
                        end tell'`
            exec(cmd, (err, stdout, stderr) => {
                if (err) reject(stderr)
                reslove(stdout.trim());
            });
        }
});

special = async cmd => {
    // 判断是否 windows 系统
    if (cmd.includes('{{isWin}}')) {
        let repl = isWin ? 1 : 0;
        cmd = cmd.replace(/\{\{isWin\}\}/mg, repl)
    }

    // 获取资源管理器或访达当前目录
    if (cmd.includes('{{pwd}}')) {
        let repl = await pwd();
        cmd = cmd.replace(/\{\{pwd\}\}/mg, repl)
    }
    // 获取 Chrome 当前链接
    if (cmd.includes('{{ChromeUrl}}')) {
        let repl = await chromeUrl();
        cmd = cmd.replace(/\{\{ChromeUrl\}\}/mg, repl)
    }
    // 获取剪切板的文本
    if (cmd.includes('{{ClipText}}')) {
        let repl = clipboard.readText();
        cmd = cmd.replace(/\{\{ClipText\}\}/mg, repl)
    }
    // 获取选中的文本
    if (cmd.includes('{{SelectText}}')) {
        let repl = getSelectText();
        cmd = cmd.replace(/\{\{SelectText\}\}/mg, repl)
    }
    // 获取选中的文件
    if (cmd.includes('{{SelectFile}}')) {
        let repl = getSelectFile();
        cmd = cmd.replace(/\{\{SelectFile\}\}/mg, repl)
    }
    return cmd;
}

run = async (cmd, option, codec, callback) => {
    var tmp = os.tmpdir(),
        bin = option.bin,
        argv = option.argv,
        ext = option.ext;
    cmd = await special(cmd);
    let script = path.join(tmp, `QuickCommandTempScript.${ext}`)
    if (ext == 'bat' || ext == 'ps1') cmd = iconv.encode(cmd, 'cp936');
    fs.writeFileSync(script, cmd);
    var argvs = [script]
    if (argv) {
        argvs = argv.split(' ')
        argvs.push(script);
    }
    if (bin) {
        var child = spawn(bin, argvs, { encoding: 'buffer' })
    } else {
        var child = spawn(script, { encoding: 'buffer' })
    }
    var chunks = [],
        err_chunks = [];
    codec = isWin ? codec : 'utf8';
    child.stdout.on('data', chunk => {
        chunks.push(iconv.decode(chunk, codec))
    })
    child.stderr.on('data', err_chunk => {
        err_chunks.push(iconv.decode(err_chunk, codec))
    })
    child.on('close', code => {
        let stdout = chunks.join("");
        let stderr = err_chunks.join("");
        callback(stdout, stderr)
    })
}