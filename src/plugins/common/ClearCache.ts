/* eslint-disable no-console */
declare const __NGROK_HOST__: string;

(() => {
  if (!window || !window.caches) {
    return;
  }

  window.caches.keys()
    .then(keys => {
      for (const key of keys) {
        if (key.startsWith('Site-')) {
          window.caches.open(key)
            .then(cache => {
              return Promise.all([cache.keys(), cache]);
            })
            .then(([requests, cache]) => {
              for (const request of requests) {
                if (request.url.indexOf(__NGROK_HOST__) !== -1) {
                  cache.delete(request)
                    .then(result => {
                      if (result) {
                        console.log(`Removed url '${request.url}' from cache`);
                      }
                      else {
                        console.log(`Unable to remove url '${request.url}' from cache`);
                      }
                    })
                    .catch(err => {
                      console.log(`Unable to remove url '${request.url}' from cache`);
                      console.log(err);
                    });
                }
              }
            })
        }
      }
    })

})();
