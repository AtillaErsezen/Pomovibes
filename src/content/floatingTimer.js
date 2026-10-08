(function () {
  console.log('Floating Timer content script loaded');

  let floatingTimer = null;
  let timer = null; // the saved timer (chrome.storage.local)
  let enabled = false; // the "Floating Timer" toggle (chrome.storage.sync)
  let timerKnown = false;
  let enabledKnown = false;
  let redrawInterval = null;
  let askedForEnd = null; // the phase end we've already asked the background to handle

  const removeFloatingTimer = () => {
    clearInterval(redrawInterval);
    redrawInterval = null;
    if (!floatingTimer) return;
    const timerToRemove = floatingTimer;
    floatingTimer = null;
    timerToRemove.style.opacity = '0';
    setTimeout(() => timerToRemove.remove(), 700);
  };

  const createFloatingTimer = () => {
    if (floatingTimer) return; // avoid duplicate creation
    console.log('Creating floating timer...');
    floatingTimer = document.createElement('div');
    floatingTimer.id = 'pomodoro-floating-timer';
    Object.assign(floatingTimer.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 16px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      borderRadius: '12px',
      zIndex: '10000',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)',
      backdropFilter: 'blur(5px)',
      transition: 'all 0.7s ease-in-out',
      cursor: 'move'
    });

    const timerText = document.createElement('span');
    timerText.id = 'pomodoro-timer-text';
    timerText.className = 'text-lg font-mono';

    const closeButton = document.createElement('button');
    Object.assign(closeButton.style, {
      background: 'none',
      border: 'none',
      color: 'white',
      fontSize: '18px',
      cursor: 'pointer',
      padding: '0',
      transition: 'color 0.7s ease-in-out',
    });
    closeButton.innerHTML = '✕';
    closeButton.setAttribute('aria-label', 'Close floating timer');
    closeButton.onmouseover = () => (closeButton.style.color = '#ff4444');
    closeButton.onmouseout = () => (closeButton.style.color = 'white');
    closeButton.onclick = (e) => {
      e.stopPropagation();
      // Same as toggling "Floating Timer" off in the popup
      enabled = false;
      chrome.storage.sync.set({ floatingTimerEnabled: false });
      render();
    };

    floatingTimer.appendChild(timerText);
    floatingTimer.appendChild(closeButton);

    // Drag functionality as defined...
    let offsetX = 0, offsetY = 0, isDragging = false;
    const onMouseDown = (e) => {
      offsetX = e.clientX - floatingTimer.getBoundingClientRect().left;
      offsetY = e.clientY - floatingTimer.getBoundingClientRect().top;
      floatingTimer.style.transition = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    const onMouseMove = (e) => {
      const newLeft = (e.clientX - offsetX) + 'px';
      const newTop = (e.clientY - offsetY) + 'px';
      if (!isDragging) {
        isDragging = true;
        requestAnimationFrame(() => {
          floatingTimer.style.left = newLeft;
          floatingTimer.style.top = newTop;
          floatingTimer.style.right = 'auto';
          isDragging = false;
        });
      }
    };
    const onMouseUp = () => {
      floatingTimer.style.transition = 'all 0.7s ease-in-out';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    floatingTimer.addEventListener('mousedown', onMouseDown);

    document.body.appendChild(floatingTimer);
  };

  // Seconds left: a running timer counts down to its end time; a stopped one keeps timeLeft
  const secondsLeft = () =>
    timer.state === 'running' && typeof timer.endsAt === 'number'
      ? Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000))
      : timer.timeLeft;

  const draw = () => {
    const timerText = document.getElementById('pomodoro-timer-text');
    const left = secondsLeft();
    if (timerText) {
      const mins = Math.floor(left / 60);
      const secs = left % 60;
      timerText.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    // At 0:00, ask the background to finish the phase in case its alarm is late
    if (left === 0 && askedForEnd !== timer.endsAt) {
      askedForEnd = timer.endsAt;
      chrome.runtime.sendMessage({ type: 'CHECK_TIMER' });
    }
  };

  // Shown only while the toggle is on and the timer is running
  const render = () => {
    if (!enabled || !timer || timer.state !== 'running') {
      removeFloatingTimer();
      return;
    }
    if (!floatingTimer) createFloatingTimer();
    draw();
    if (!redrawInterval) redrawInterval = setInterval(draw, 250);
  };

  // Follow every change: start/stop/reset/next phase, and the toggle (popup or close button)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.timer) {
      timer = changes.timer.newValue || null;
      timerKnown = true;
      render();
    }
    if (area === 'sync' && changes.floatingTimerEnabled) {
      enabled = changes.floatingTimerEnabled.newValue === true;
      enabledKnown = true;
      render();
    }
  });

  // On page load. A change that arrived meanwhile is newer, so it wins.
  chrome.storage.local.get(['timer'], (localData) => chrome.storage.sync.get(['floatingTimerEnabled'], (syncData) => {
    if (!timerKnown) timer = localData.timer || null;
    if (!enabledKnown) enabled = syncData.floatingTimerEnabled === true;
    render();
  }));
})();