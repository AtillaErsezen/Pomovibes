(function () {
  console.log('Floating Timer content script loaded');

  let floatingTimer = null;
  let timeLeft = 25 * 60;

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
    closeButton.onclick = () => {
      if (floatingTimer) {
        floatingTimer.style.opacity = '0';
        setTimeout(() => {
          floatingTimer.remove();
          floatingTimer = null;
        }, 700);
      }
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

  const updateTimerDisplay = () => {
    if (!floatingTimer) createFloatingTimer();
    const timerText = document.getElementById('pomodoro-timer-text');
    if (timerText) {
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      timerText.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FLOATING_TIMER') {
      timeLeft = message.timeLeft;
      // Only create/show if enabled, or if already visible (to keep it until STOP)
      chrome.storage.sync.get(['floatingTimerEnabled'], (data) => {
        if (data.floatingTimerEnabled === true || floatingTimer) {
          updateTimerDisplay();
        }
      });
    }

    if (message.type === 'STOP_TIMER' || message.type === 'RESET_TIMER') {
      if (floatingTimer) {
        floatingTimer.style.opacity = '0';
        setTimeout(() => {
          floatingTimer.remove();
          floatingTimer = null;
        }, 700);
      }
    }
  });

  // Initial sync (optional, for page reloads)
  chrome.storage.sync.get(['timer', 'floatingTimerEnabled', 'settings'], (data) => {
    let study = (data.settings && data.settings.study) ? data.settings.study : 25;
    let timer = data.timer || { state: 'stopped', timeLeft: study * 60, phase: 'study1' };
    timeLeft = timer.timeLeft;
    if (data.floatingTimerEnabled === true && timer.state === 'running') {
      updateTimerDisplay();
    }
  });

  chrome.runtime.onSuspend.addListener(() => {
    if (floatingTimer) {
      floatingTimer.remove();
      floatingTimer = null;
    }
  });

  // When initializing or resetting timer:
  chrome.storage.sync.set({ timer: { state: 'stopped', timeLeft: settings.study * 60, phase: 'study1' } });
})();