export function authErrorMessage(error:unknown,arabic:boolean):string {
 const value=error as {code?:string;message?:string;status?:number;kind?:string};
 const code=value?.code??value?.kind??'';const message=value?.message??'';
 if(code==='invalid_credentials'||/invalid login/i.test(message))return arabic?'البريد الإلكتروني أو كلمة المرور غير صحيحة.':'The email or password is wrong.';
 if(code==='email_not_confirmed')return arabic?'افتح رسالة تأكيد البريد أولًا، ثم سجّل الدخول.':'Confirm your email first, then sign in.';
 if(code==='over_email_send_rate_limit'||value?.status===429)return arabic?'محاولات كثيرة خلال وقت قصير. انتظر قليلًا وأعد المحاولة.':'Too many tries. Wait a little and try again.';
 if(code==='weak_password'||/password.*least/i.test(message))return arabic?'استخدم كلمة مرور أقوى من ٨ أحرف على الأقل.':'Use a stronger password with at least 8 characters.';
 if(code==='user_already_exists')return arabic?'هذا البريد مسجل. استخدم تسجيل الدخول أو استعادة كلمة المرور.':'This email has an account. Sign in or reset the password.';
 if(code==='login_required'||value?.status===401)return arabic?'انتهت الجلسة. سجّل الدخول مجددًا.':'Your session ended. Sign in again.';
 return arabic?'لم تكتمل العملية. تحقق من الاتصال ثم أعد المحاولة.':'Could not finish. Check your internet and try again.';
}
