import React, { useState, useEffect } from 'react';

const Calendar = ({ darkMode }) => {
  const [sessions, setSessions] = useState({});
  const [completedTasks, setCompletedTasks] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [settings, setSettings] = useState({
    study: 25,
    shortBreak: 5,
    longBreak: 15,
    cycles: 4,
  });

  useEffect(() => {
    // Load initial data
    const loadData = () => {      chrome.storage.sync.get(['sessions', 'completedTasks', 'settings'], (data) => {
        console.log('Initial data loaded:', data);
        setSessions(data.sessions || {});
        setSettings(data.settings || {
          study: 25,
          shortBreak: 5,
          longBreak: 15,
          cycles: 4,
        });
        const tasks = data.completedTasks || {};
        // Ensure valid date keys
        const cleanedTasks = {};
        Object.keys(tasks).forEach(key => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            cleanedTasks[key] = Array.isArray(tasks[key]) ? tasks[key] : [];
          }
        });
        setCompletedTasks(cleanedTasks);
      });
    };
    loadData();

    // Listen for calendar updates from background.js
    const handleMessages = (message) => {
      if (message.type === 'CALENDAR_UPDATE') {
        console.log('Received CALENDAR_UPDATE:', message);
        setSessions(message.sessions || {});
      }
    };
    
    chrome.runtime.onMessage.addListener(handleMessages);

    // Update sessions for study time
    const updateSessions = () => {
      chrome.storage.sync.get(['timer'], (data) => {
        const timer = data.timer || { phase: 'longStudy1', state: 'stopped' };
        if (timer.phase.includes('Study') && timer.state === 'running') {
          const date = new Date().toISOString().split('T')[0];
          setSessions((prev) => {
            const updated = { ...prev, [date]: (prev[date] || 0) + 1 / 60 };
            chrome.storage.sync.set({ sessions: updated });
            return updated;
          });
        }
      });
    };

    const interval = setInterval(updateSessions, 60000);
    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(handleMessages);
    };
  }, []);

  useEffect(() => {
    // Listen for custom event from TodoList
    const handleCustomUpdate = (e) => {
      if (e.detail) {
        console.log('Received completedTasksUpdated event:', e.detail);
        setCompletedTasks(prev => {
          const updated = { ...prev, ...e.detail };
          // Ensure arrays for all date keys
          Object.keys(updated).forEach(key => {
            if (!Array.isArray(updated[key])) {
              updated[key] = [];
            }
          });
          return updated;
        });
      }
    };
    window.addEventListener('completedTasksUpdated', handleCustomUpdate);
    return () => {
      window.removeEventListener('completedTasksUpdated', handleCustomUpdate);
    };
  }, []);

  useEffect(() => {
    // Listen for storage changes
    const handleStorageChange = (changes, area) => {
      if (area === 'sync' && changes.completedTasks) {
        const newValue = changes.completedTasks.newValue || {};
        console.log('Storage changed:', newValue);
        // Clean and update state
        const cleanedTasks = {};
        Object.keys(newValue).forEach(key => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            cleanedTasks[key] = Array.isArray(newValue[key]) ? newValue[key] : [];
          }
        });
        setCompletedTasks(cleanedTasks);
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Log completedTasks for debugging
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    console.log('completedTasks state:', completedTasks);
    console.log(`Today's tasks (${today}):`, completedTasks[today] || []);
  }, [completedTasks]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const renderCalendar = () => {
    const today = new Date();
    console.log('Rendering calendar for date:', currentDate);
    console.log('Rendering calendar for date today:', today);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
      days.push(<div key={`empty-${i}`} className="w-8 h-8" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      console.log('Rendering date:', dateStr);      const isToday = dateStr === today.toISOString().split('T')[0];
      console.log('Is today:', isToday);
      const minutes = sessions[dateStr] || 0;
      console.log('Minutes studied:', minutes);
      const tasks = Array.isArray(completedTasks[dateStr]) ? completedTasks[dateStr] : [];
      console.log('Tasks for date:', tasks);
      const hasStudied = minutes > 0;
      const prevDate = new Date(year, month, day - 1).toISOString().split('T')[0];
      const nextDate = new Date(year, month, day + 1).toISOString().split('T')[0];
      const prevStudied = sessions[prevDate] > 0;
      const nextStudied = sessions[nextDate] > 0;
      const isStreak = hasStudied && (prevStudied || nextStudied);

      const baseColor = isToday
        ? 'bg-blue-500'
        : hasStudied
        ? 'bg-gray-200 dark:bg-gray-600'
        : darkMode
        ? 'bg-gray-800'
        : 'bg-gray-50';
      const streakColor = isStreak ? (darkMode ? 'bg-green-700' : 'bg-green-300') : '';

      days.push(
        <div key={dateStr} className="w-8 h-8 flex items-center justify-center pointer-events-none">
          <div className="relative group">            <div
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all duration-500 ease-in-out hover:scale-110 ${baseColor} ${streakColor} ${
                darkMode ? 'text-white' : 'text-gray-900'
              } animate-fade-in relative pointer-events-auto overflow-hidden`}
            >
              {hasStudied && (
                <div 
                  className={`absolute bottom-0 left-0 right-0 ${darkMode ? 'bg-purple-600' : 'bg-purple-400'} opacity-70`} 
                  style={{ 
                    height: `${Math.min(100, Math.max(15, minutes / 60 * 100))}%`,
                    transition: 'height 0.5s ease-in-out'
                  }}
                />
              )}
              {isToday && (
                <span className="absolute top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full z-10" />
              )}
              <span className="text-xs font-sans relative z-10">{day}</span>
            </div>
            <div
              className={`absolute z-10 top-10 left-1/2 transform -translate-x-1/2 w-32 p-2 rounded-lg shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-700 ease-in-out ${
                darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
              } pointer-events-none`}
            >              <p className="text-xs font-sans flex items-center justify-between">
                <span>Study:</span> 
                <span className="font-medium">{minutes.toFixed(0)} min</span>
              </p>
              <p className="text-xs font-sans flex items-center justify-between">
                <span>Completed Sessions:</span>
                <span className="font-medium">{Math.floor(minutes / settings.study)}</span>
              </p>
              <p className="text-xs font-sans flex items-center justify-between">
                <span>Tasks Done:</span>
                <span className="font-medium">{tasks.length}</span>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return days;
  };

  const changeMonth = (offset) => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + offset)));
  };

  const goToDate = () => {
    const year = parseInt(document.getElementById('yearInput').value) || currentDate.getFullYear();
    const month = parseInt(document.getElementById('monthInput').value) || currentDate.getMonth() + 1;
    if (year && month && month >= 1 && month <= 12) {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  return (
    <div
      className={`p-3 rounded-xl shadow-lg backdrop-blur-md transition-all duration-700 ease-in-out ${
        darkMode
          ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700'
          : 'bg-gradient-to-br from-white to-gray-100 border-gray-200'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold tracking-tight font-sans">{`${monthName} ${year}`}</h2>
        <div className="flex items-center space-x-1">          <button
            onClick={() => changeMonth(-1)}
            className={`w-6 h-6 text-xs rounded-full transition-all duration-300 ease-in-out flex items-center justify-center text-white shadow-md ${
              darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
            }`}
          >
            ←
          </button>
          <div className={`flex items-center space-x-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-1 shadow-inner`}>
            <input
              id="monthInput"
              type="text"
              placeholder="MM"
              maxLength="2"
              className={`w-10 p-1 rounded-l-lg border-0 font-sans bg-transparent text-center text-sm ${darkMode ? 'text-white' : 'text-gray-900'} placeholder-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              defaultValue={String(currentDate.getMonth() + 1).padStart(2, '0')}
              onBlur={(e) => {
                let value = parseInt(e.target.value);
                if (isNaN(value) || value < 1) value = 1;
                if (value > 12) value = 12;
                e.target.value = String(value).padStart(2, '0');
              }}
            />
            <span className={`text-sm font-sans ${darkMode ? 'text-white' : 'text-gray-900'}`}>/</span>
            <input
              id="yearInput"
              type="text"
              placeholder="YYYY"
              maxLength="4"
              className={`w-16 p-1 rounded-r-lg border-0 font-sans bg-transparent text-center text-sm ${darkMode ? 'text-white' : 'text-gray-900'} placeholder-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              defaultValue={currentDate.getFullYear()}
              onBlur={(e) => {
                let value = parseInt(e.target.value);
                if (isNaN(value)) value = currentDate.getFullYear();
                e.target.value = value;
              }}
            />
          </div>
          <button
            onClick={goToDate}
            className="px-2 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-300 ease-in-out text-xs shadow-md"
          >
            Go
          </button>
          <button
            onClick={goToToday}
            className="w-6 h-6 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-all duration-300 ease-in-out flex items-center justify-center shadow-md"
          >
            ◎
          </button><button
            onClick={() => changeMonth(1)}
            className={`w-6 h-6 text-xs rounded-full transition-all duration-300 ease-in-out flex items-center justify-center text-white shadow-md ${
              darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
            }`}
          >
            →
          </button>
        </div>
      </div>
      <div className="flex text-xs font-medium mb-1 text-gray-500 dark:text-gray-400 justify-around font-sans">
        <span>M</span>
        <span>T</span>
        <span>W</span>
        <span>T</span>
        <span>F</span>
        <span>S</span>
        <span>S</span>
      </div>
      <div className="grid grid-cols-7 gap-1 p-1 rounded-lg">{renderCalendar()}</div>
    </div>
  );
};

export default Calendar;