/**
 * Generates a self-contained decrypt.html with embedded ciphertext.
 * Recipient only needs the password to decrypt.
 */
export function generateDecryptHtml(ciphertext: string, filename: string): string {
	const escapedCiphertext = ciphertext
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "");

	const escapedFilename = filename
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"');

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vault Crypto - ${escHtml(filename)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.container{background:#16213e;border-radius:12px;padding:40px;max-width:600px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3)}
h1{font-size:24px;margin-bottom:8px;color:#fff}
.subtitle{font-size:14px;color:#888;margin-bottom:24px}
label{display:block;font-size:14px;margin-bottom:8px;color:#aaa}
input[type=password]{width:100%;background:#0f3460;border:1px solid #333;border-radius:8px;padding:12px;color:#e0e0e0;font-size:16px;margin-bottom:16px}
input[type=password]:focus{outline:none;border-color:#533483}
button{width:100%;padding:12px;background:#533483;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;transition:background .2s}
button:hover{background:#6c44b2}
button:disabled{background:#333;cursor:not-allowed}
.result{margin-top:16px;display:none}
.result textarea{width:100%;min-height:200px;background:#1a3a1a;border:1px solid #2a5a2a;border-radius:8px;padding:12px;color:#e0e0e0;font-family:monospace;font-size:13px;resize:vertical}
.error{margin-top:16px;padding:12px;background:#3a1a1a;border:1px solid #5a2a2a;border-radius:8px;color:#ff8888;display:none;font-size:14px}
.info{margin-top:12px;font-size:12px;color:#666}
</style>
</head>
<body>
<div class="container">
<h1>Vault Crypto \u89e3\u5bc6\u5de5\u5177</h1>
<div class="subtitle">${escHtml(filename)}</div>
<label for="password">\u5bc6\u7801</label>
<input type="password" id="password" placeholder="\u8f93\u5165\u89e3\u5bc6\u5bc6\u7801">
<button id="decrypt-btn" onclick="doDecrypt()">\u89e3\u5bc6</button>
<div class="result" id="result-section">
<label>\u89e3\u5bc6\u7ed3\u679c</label>
<textarea id="result" readonly></textarea>
</div>
<div class="error" id="error"></div>
<div class="info">\u672c\u5de5\u5177\u5b8c\u5168\u5728\u6d4f\u89c8\u5668\u672c\u5730\u8fd0\u884c\uff0c\u4e0d\u4f1a\u4e0a\u4f20\u4efb\u4f55\u6570\u636e\u3002\u57fa\u4e8e AES-256-GCM + PBKDF2-SHA512\u3002</div>
</div>
<script>
var EMBEDDED_CIPHERTEXT="${escapedCiphertext}";
var MAGIC_HEADER="-----VAULT-CRYPTO-----";
function base64ToUint8(b){var a=atob(b);var d=new Uint8Array(a.length);for(var i=0;i<a.length;i++)d[i]=a.charCodeAt(i);return d}
async function deriveKey(pw,salt,iter){var enc=new TextEncoder();var km=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:iter,hash:"SHA-512"},km,{name:"AES-GCM",length:256},false,["decrypt"])}
async function doDecrypt(){var btn=document.getElementById("decrypt-btn");var err=document.getElementById("error");var res=document.getElementById("result-section");var r=document.getElementById("result");err.style.display="none";res.style.display="none";var pw=document.getElementById("password").value;if(!pw){err.textContent="\u8bf7\u8f93\u5165\u5bc6\u7801";err.style.display="block";return}btn.disabled=true;btn.textContent="\u89e3\u5bc6\u4e2d...";try{var ct=EMBEDDED_CIPHERTEXT;if(!ct.startsWith(MAGIC_HEADER))throw new Error("invalid");var pb=ct.slice(MAGIC_HEADER.length).trim();var pl=JSON.parse(atob(pb));var salt=base64ToUint8(pl.salt);var iv=base64ToUint8(pl.iv);var ciph=base64ToUint8(pl.ciphertext);var iter=pl.iter||1000000;var key=await deriveKey(pw,salt,iter);var dec=await crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,ciph);r.value=new TextDecoder().decode(dec);res.style.display="block"}catch(e){err.textContent="\u89e3\u5bc6\u5931\u8d25\uff1a\u5bc6\u7801\u9519\u8bef\u6216\u6587\u4ef6\u5df2\u635f\u574f";err.style.display="block"}finally{btn.disabled=false;btn.textContent="\u89e3\u5bc6"}}
document.getElementById("password").addEventListener("keydown",function(e){if(e.key==="Enter")doDecrypt()});
</script>
</body>
</html>`;
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
