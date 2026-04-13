fetch('https://openrouter.ai/api/v1/models').then(r => r.json()).then(d => console.log(JSON.stringify(d.data.filter(m => m.id.endsWith(':free')).map(m => m.id), null, 2)))
