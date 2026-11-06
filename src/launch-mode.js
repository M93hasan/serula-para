/**
 * The launcher deliberately does not persist a user's mode selection.
 * Authentication remains enforced by the server; this dialog grants no access.
 */
export function chooseLaunchMode({documentRef = document, onlineHref = 'https://para.serula.site/', localHref = 'http://127.0.0.1:8788/', currentMode = 'local'} = {}) {
  return new Promise(resolve => {
    const overlay = documentRef.createElement('div');
    overlay.id = 'para-launch-mode';
    overlay.setAttribute('role', 'presentation');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#080e19ed;display:grid;place-items:center;padding:20px';
    const dialog = documentRef.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'launch-mode-title');
    dialog.style.cssText = 'width:min(100%,430px);background:#151f30;color:white;border:1px solid #40516d;border-radius:18px;padding:28px;box-shadow:0 24px 80px #0009';
    const title = documentRef.createElement('h2');
    title.id = 'launch-mode-title';
    title.textContent = 'PARA nasıl açılsın?';
    const description = documentRef.createElement('p');
    description.textContent = 'Her açılışta çalışma modunu seçin. Yerel mod cihazınızın motoruna bağlanır.';
    const local = documentRef.createElement('button');
    local.type = 'button';
    local.textContent = 'Local / Bu bilgisayarda aç';
    local.style.cssText = 'display:block;width:100%;padding:14px;margin:20px 0 10px;background:#2477df;color:white;border:0;border-radius:10px;cursor:pointer';
    const online = documentRef.createElement('button');
    online.type = 'button';
    online.textContent = 'İnternet tabanlı / Web uygulamasını aç';
    online.setAttribute('aria-describedby', 'launch-online-note');
    online.style.cssText = 'display:block;width:100%;padding:14px;border:1px solid #526279;border-radius:10px;background:#263246;color:#dbe8f7;cursor:pointer';
    const note = documentRef.createElement('p');
    note.id = 'launch-online-note';
    note.textContent = 'Web sürümü ayrı Cloudflare Google oturumuyla çalışır. Yerel Binance kasası ve oturum web uygulamasına aktarılmaz.';
    note.style.cssText = 'font-size:13px;color:#b8c2d4;margin-top:12px';
    dialog.append(title,description,local,online,note);
    overlay.append(dialog);
    documentRef.body.append(overlay);
    local.addEventListener('click', () => { overlay.remove(); if(currentMode === 'local')resolve('local'); else documentRef.defaultView.location.assign(localHref); }, {once:true});
    online.addEventListener('click', () => { overlay.remove(); if(currentMode === 'web')resolve('online'); else documentRef.defaultView.location.assign(onlineHref); }, {once:true});
    local.focus();
  });
}
