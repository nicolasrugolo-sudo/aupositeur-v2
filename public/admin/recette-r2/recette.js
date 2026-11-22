(() => {
  const media = 'https://aupositeur-media-api.nicolas-rugolo.workers.dev';
  const result = document.getElementById('result');
  const button = document.getElementById('run');
  const log = message => { result.textContent += message + '\n'; };
  const check = (condition, label) => { if (!condition) throw Error(label); log(label + ' : OK'); };
  const json = (body, method = 'POST') => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

  async function request(url, options) {
    const response = await window.aupositeurWorkerRequest(url, options);
    if (!response.ok) throw Error('Requête ' + new URL(url).pathname + ' : HTTP ' + response.status);
    return response.json();
  }

  function wave(sample) {
    const bytes = new Uint8Array(2044);
    const view = new DataView(bytes.buffer);
    for (const [offset, text] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']]) {
      bytes.set(new TextEncoder().encode(text), offset);
    }
    view.setUint32(4, bytes.length - 8, true);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(40, bytes.length - 44, true);
    view.setInt16(44, sample, true);
    return bytes;
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    result.textContent = '';
    const id = crypto.randomUUID();
    const name = 'studio-recette-' + id + '.wav';
    const fileKey = 'audio/tracks/' + name;
    const audioAdmin = media + '/admin/audio-files';
    let audioTouched = false;
    let failed = false;

    async function upload(bytes) {
      const meta = {key:fileKey,name,type:'audio/wav',size:bytes.length};
      const signed = await request(audioAdmin + '/upload-url', json(meta));
      check(signed.key === fileKey && signed.expiresIn === 12, 'Clé audio et durée de signature de recette');
      audioTouched = true;
      const put = await fetch(signed.uploadUrl, {method:'PUT',headers:{'Content-Type':signed.contentType},body:bytes});
      check(put.ok, 'Envoi signé dans R2');
      const confirmed = await request(audioAdmin + '/confirm', json(meta));
      check(confirmed.ok && confirmed.key === fileKey && confirmed.bytes === bytes.length, 'Confirmation audioKey');
      return signed;
    }

    try {
      const before = await request(audioAdmin);
      check(before.files.every(item => item.key !== fileKey), 'Clé audio inédite');
      const first = await upload(wave(13));
      const publicAudio = media + '/media/' + fileKey;
      const firstRead = await fetch(publicAudio + '?check=first', {cache:'no-store'});
      check(firstRead.ok && new DataView(await firstRead.arrayBuffer()).getInt16(44,true) === 13, 'Lecture audio publique');
      await upload(wave(29));
      const replaced = await fetch(publicAudio + '?check=second', {cache:'no-store'});
      check(replaced.ok && new DataView(await replaced.arrayBuffer()).getInt16(44,true) === 29, 'Remplacement sur la même clé');

      await new Promise(resolve=>setTimeout(resolve,15000));
      try {
        const expired = await fetch(first.uploadUrl,{method:'PUT',headers:{'Content-Type':first.contentType},body:wave(13)});
        check(expired.status === 403, 'Refus R2 après expiration de la signature');
      } catch (error) {
        throw Error('Expiration : le navigateur ne donne pas accès au statut R2 (' + error.name + ').');
      }
    } catch (error) {
      failed = true;
      log('Échec : ' + error.message);
    } finally {
      for (const [enabled, url, options, label] of [
        [audioTouched,audioAdmin,json({key:fileKey},'DELETE'),'Retrait de la fixture audio'],
      ]) {
        if (!enabled) continue;
        try { check((await request(url,options)).ok,'Retrait vérifié — ' + label); }
        catch (error) { failed = true; log(label + ' : ' + error.message + ' (' + id + ')'); }
      }
      log(failed ? 'Recette incomplète.' : 'Recette terminée.');
    }
  });
})();
