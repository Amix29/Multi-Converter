(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  for (const theme of ['light', 'dark']) {
    for (const width of [375, 768, 1024, 1440]) {
      await invoke('resize', {width});
      await new Promise(resolve => setTimeout(resolve, 700));
      await invoke('keyboard');
      await new Promise(resolve => setTimeout(resolve, 200));
      const value = await window.runProbe(theme, width);
      await invoke('report', {value});
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  }
  await invoke('finish');
})().catch(error => console.error(error));
