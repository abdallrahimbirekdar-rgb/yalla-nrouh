const {copyFileSync,mkdirSync,writeFileSync}=require('node:fs');
const policy=require('../src/privacy-policy.json');

function escape(value){
 return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}
function page(title,content){
 return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>body{background:#edf3fb;color:#082648;font:1rem/1.8 system-ui,sans-serif;margin:0}main{max-width:48rem;margin:auto;padding:1rem}article{background:#fff;padding:1.25rem;margin:1rem 0;border-radius:1rem}a{color:#164f84;overflow-wrap:anywhere}h2{margin-block:.5rem}nav{display:flex;gap:1rem;flex-wrap:wrap}</style>
<main><h1>${escape(title)}</h1>${content}</main></html>`;
}

const locales=['ar','en','de'];
const articles=locales.map((lang,index)=>`<article id="${lang}" lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}">
${policy.sections.map(section=>`<h2>${escape(section.heading[index])}</h2><p>${escape(section.body[index])}</p>`).join('')}
<p><a href="mailto:${escape(policy.email)}">${escape(policy.email)}</a></p></article>`).join('');
writeFileSync('dist-pages/privacy.html',page('سياسة خصوصية يلّا نروح',
 '<nav><a href="#ar">العربية</a><a href="#en" lang="en">English</a><a href="#de" lang="de">Deutsch</a><a href="./delete-account.html">حذف الحساب / Delete account</a></nav>'+articles));

writeFileSync('dist-pages/delete-account.html',page('حذف حساب يلّا نروح',`
<article><p>يمكنك حذف حسابك وبياناته من الموقع دون تنزيل التطبيق. افتح نموذج الحذف، سجّل الدخول، ثم أدخل كلمة المرور وأكّد الحذف. ألغِ طلبك أو أنهِ رحلتك النشطة قبل المتابعة.</p>
<p><a href="./delete-account/">افتح نموذج حذف الحساب</a></p></article>
<article lang="en" dir="ltr"><h2>Delete your Yalla Nrouh account</h2>
<p>You can delete your account and data on the website. Open the form, sign in, enter your password and confirm. Cancel an open request or finish an active ride before continuing.</p>
<p><a href="./delete-account/">Open the account deletion form</a></p></article>
<article lang="de" dir="ltr"><h2>Dein Yalla-Nrouh-Konto löschen</h2>
<p>Du kannst dein Konto und deine Daten auf der Website löschen. Öffne das Formular, melde dich an und bestätige mit deinem Passwort. Beende zuvor die laufende Fahrt oder storniere die offene Anfrage.</p>
<p><a href="./delete-account/">Formular zur Kontolöschung öffnen</a></p></article>
<a href="./privacy.html">سياسة الخصوصية / Privacy policy / Datenschutz</a>`));

mkdirSync('dist-pages/delete-account',{recursive:true});
copyFileSync('dist-pages/index.html','dist-pages/delete-account/index.html');
