import React, { useState, useEffect } from 'react';
import quotesData from '../data/quotes.json';

const Quote = ({ darkMode }) => {
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    const randomQuote = () => {
      const newQuote = quotesData[Math.floor(Math.random() * quotesData.length)];
      setQuote(newQuote);
    };
    randomQuote();

    const listener = (message) => {
      if (message.type === 'TIMER_UPDATE' && message.timer.phase.includes('longStudy')) {
        randomQuote();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <div
      className={`p-6 rounded-xl shadow-lg ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } animate-fade-in transition-all duration-700 ease-in-out`}
    >
      <p className={`text-lg italic ${darkMode ? 'text-gray-300' : 'text-gray-600'} leading-relaxed`}>{quote?.text || 'Loading...'}</p>
      <p className={`text-right text-md font-medium mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        — {quote?.author || 'Unknown'}
      </p>
    </div>
  );
};

export default Quote;