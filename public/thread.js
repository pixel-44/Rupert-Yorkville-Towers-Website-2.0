'use strict';

// Keeps an open conversation current: sends without a page reload and polls for
// the other resident's replies.
(function () {
  var list = document.getElementById('messages');
  var form = document.getElementById('reply-form');
  if (!list || !form) return;

  var convoId = list.dataset.convo;
  var box = form.querySelector('textarea');

  function scrollToEnd() {
    list.scrollTop = list.scrollHeight;
  }

  function append(message) {
    var li = document.createElement('li');
    li.className = 'msg ' + (message.mine ? 'mine' : 'theirs');

    var body = document.createElement('p');
    body.className = 'msg-body';
    body.textContent = message.body;

    var time = document.createElement('p');
    time.className = 'msg-time';
    time.textContent = message.at;

    li.appendChild(body);
    li.appendChild(time);
    list.appendChild(li);
    list.dataset.last = String(message.id);
  }

  function poll() {
    fetch('/api/messages/' + convoId + '?after=' + (list.dataset.last || 0), {
      headers: { Accept: 'application/json' },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.messages.length) return;
        var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        data.messages.forEach(append);
        if (atBottom) scrollToEnd();
      })
      .catch(function () { /* offline or reloading — the next tick retries */ });
  }

  form.addEventListener('submit', function (event) {
    var text = box.value.trim();
    if (!text) return;
    event.preventDefault();

    var params = new URLSearchParams();
    params.set('body', text);

    fetch('/messages/' + convoId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      redirect: 'follow',
    })
      .then(function () {
        box.value = '';
        poll();
        scrollToEnd();
      })
      .catch(function () {
        // Fall back to a normal form post if the request could not be made.
        form.submit();
      });
  });

  scrollToEnd();
  setInterval(poll, 5000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) poll();
  });
})();
