// 본인인증 제공자 — 지금은 흉내(스텁). 나중에 문자(SMS OTP)나 PASS로 갈아끼우기 위한 자리.
// 화면은 이 인터페이스만 부르면 되고, 실제 구현만 교체하면 된다.
//
//   const provider = getIdentityProvider();
//   await provider.sendCode(phone);          // 인증번호 발송
//   const ok = await provider.verifyCode(phone, code);
//
// 실제 서버가 생기면 ServerSmsProvider / PassProvider 로 바꿔 getIdentityProvider()가 반환하게 한다.

// 스텁: 실제 문자를 보내지 않고, 개발용 고정번호를 쓴다.
class StubProvider {
  constructor() { this.name = 'stub'; this._codes = new Map(); }
  async sendCode(phone) {
    const code = '000000'; // 개발용 고정 인증번호
    this._codes.set(phone, code);
    console.info('[본인인증-스텁] 발송된 인증번호(개발용):', code);
    return { sent: true, dev: true };
  }
  async verifyCode(phone, code) {
    return this._codes.get(phone) === code || code === '000000';
  }
}

// 미래 예시(구현 비어있음) — 서버 붙일 때 채운다.
// class ServerSmsProvider { async sendCode(phone){ await fetch('/api/otp/send',{...}) } ... }
// class PassProvider { ... 통신사 PASS 연동 ... }

let _provider = new StubProvider();
export function getIdentityProvider() { return _provider; }
export function setIdentityProvider(p) { _provider = p; }
