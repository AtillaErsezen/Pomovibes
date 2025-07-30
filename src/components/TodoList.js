import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const TodoList = ({ darkMode }) => {  const TODO_MAX_LENGTH = 50;
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [category, setCategory] = useState('') // Start with empty, will be populated from storage
  const [customCategories, setCustomCategories] = useState([
    // Default categories if none are loaded from storage
    { name: 'Work', color: 'coral' },
    { name: 'Personal', color: 'teal' },
    { name: 'Learning', color: 'lavender' },
    { name: 'Health', color: 'mint' },
  ])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  
  // Define CSS color variables
  const colorMap = {
    coral: '#FF7F50',
    teal: '#008080',
    lavender: '#E6E6FA',
    mint: '#98FF98',
    amber: '#FFBF00',
    violet: '#8A2BE2',
    sage: '#BCB88A',
    rose: '#FF007F',
    indigo: '#4B0082',
    emerald: '#50C878',
    gray: '#808080'
  }
  
  // Add CSS variables to document
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(colorMap).forEach(([name, hex]) => {
      root.style.setProperty(`--color-${name}`, hex);
    });
    
    return () => {
      // Cleanup
      Object.keys(colorMap).forEach(name => {
        root.style.removeProperty(`--color-${name}`);
      });
    };
  }, []);    useEffect(() => {
    chrome.storage.sync.get(['tasks', 'customCategories'], result => {
      if (result.tasks) {
        setTasks(result.tasks);
      }
      if (result.customCategories) {
        setCustomCategories(result.customCategories);
        
        // Set the current category based on saved categories
        if (result.customCategories.length > 0) {
          // Find the last used category if possible
          chrome.storage.sync.get(['lastUsedCategory'], lastCategoryResult => {
            if (lastCategoryResult.lastUsedCategory) {
              // Check if the last used category still exists
              const categoryExists = result.customCategories.some(
                cat => cat.name === lastCategoryResult.lastUsedCategory
              );
              if (categoryExists) {
                setCategory(lastCategoryResult.lastUsedCategory);
              } else {
                // Fall back to the first available category
                setCategory(result.customCategories[0].name);
              }
            } else {
              // No last used category, use the first one
              setCategory(result.customCategories[0].name);
            }
          });
        }
      }
    });
  }, []);

   useEffect(() => {
    chrome.storage.sync.set({ tasks });
  }, [tasks]);
    useEffect(() => {
    chrome.storage.sync.set({ customCategories });
  }, [customCategories]);
  
  // Save the current category when it changes
  useEffect(() => {
    chrome.storage.sync.set({ lastUsedCategory: category });
  }, [category]);

  const colorPalette = [
    'coral', 'teal', 'lavender', 'mint', 'amber',
    'violet', 'sage', 'rose', 'indigo', 'emerald',
  ].sort(() => Math.random() - 0.5)

  const getUniqueColor = () => {
    const used = customCategories.map(c => c.color)
    const available = colorPalette.filter(c => !used.includes(c))
    return available[0] || colorPalette[Math.floor(Math.random() * colorPalette.length)]
  }

  const categoryColors = customCategories.reduce((acc, { name, color }) => {
    acc[name] = color
    return acc
  }, {})
  const handleAddTask = e => {
    e.preventDefault()
    // Make sure we have a category selected - use first available if none is set
    let taskCategory = category;
    if (!taskCategory && customCategories.length > 0) {
      taskCategory = customCategories[0].name;
      setCategory(taskCategory); // Update the current category
    }
    
    if (newTask.trim() && taskCategory) {
      const item = { id: Date.now(), content: newTask.trim(), category: taskCategory, done: false }
      setTasks(prev => [...prev, item])
      setNewTask('')
    }
  }

  //Toggle completed task
    // Example: storing completed tasks by date in TodoList.js
  const handleToggleTask = id => {
  setTasks(prevTasks => {
    // Update tasks state
    const updatedTasks = prevTasks.map(t =>
      t.id === id ? { ...t, done: !t.done } : t
    );
    // Find the toggled task
    const toggledTask = updatedTasks.find(t => t.id === id);
    const today = new Date().toISOString().split('T')[0];

    // Update chrome.storage
    chrome.storage.sync.get(['completedTasks'], result => {
      let completedTasks = result.completedTasks || {};
      // Ensure completedTasks is an object
      if (Array.isArray(completedTasks) || completedTasks === null) {
        completedTasks = {};
      }
      const todayTasks = completedTasks[today] || [];
      const updatedTodayTasks = toggledTask.done
        ? [...todayTasks, id].filter((v, i, a) => a.indexOf(v) === i) // Add ID, ensure uniqueness
        : todayTasks.filter(taskId => taskId !== id); // Remove ID
      const updatedCompletedTasks = {
        ...completedTasks,
        [today]: updatedTodayTasks,
      };
      // Clean up invalid keys
      if (updatedCompletedTasks.hasOwnProperty('0')) {
        delete updatedCompletedTasks['0'];
      }
      chrome.storage.sync.set({ completedTasks: updatedCompletedTasks }, () => {
        // Dispatch event with updated data
        window.dispatchEvent(new CustomEvent('completedTasksUpdated', {
          detail: updatedCompletedTasks,
        }));
        console.log('Updated completed tasks:', updatedCompletedTasks);
      });
    });

    return updatedTasks;
  });
};

  const handleCancelTask = id => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const onDragEnd = result => {
    if (!result.destination) return
    const items = Array.from(tasks)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setTasks(items)
  }
  const addCustomCategory = () => {
    const name = newCategory.trim()
    if (name && !categoryColors[name] && customCategories.length < 10) {
      const newColor = getUniqueColor();
      setCustomCategories(prev => [
        ...prev,
        { name, color: newColor }
      ])
      setNewCategory('')
      // Set the newly added category as the current category
      setCategory(name)
      setIsModalOpen(false)
    }
  }
  const deleteCustomCategory = nameToDelete => {
    // First update the customCategories state
    setCustomCategories(prev => {
      const updatedCategories = prev.filter(c => c.name !== nameToDelete);
      
      // Update category selection to avoid having an invalid category selected
      if (nameToDelete === category) {
        // If we're deleting the currently selected category, select the first available one
        if (updatedCategories.length > 0) {
          setCategory(updatedCategories[0].name);
        } else {
          setCategory('');
        }
      }
      
      return updatedCategories;
    });
    
    // Filter out tasks with deleted category
    setTasks(prev =>
      prev.filter(t => t.category !== nameToDelete)
    );
  }

  return (
    <>
      {/* ——— PORTALED MODAL ——— */}
      {isModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">            <div
              className={`p-4 rounded-2xl shadow-2xl backdrop-blur-lg transition-all duration-700 ease-in-out ${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              } w-72 relative`}
            >
              {/* Close button at top right corner */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors duration-300"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <h3 className="text-lg font-semibold mb-3 text-center font-sans">
                Manage Categories
              </h3>
              <div className="mb-3">
                <input
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="New category name..."
                  className={`w-full p-2 rounded-lg border shadow-inner font-sans ${
                    darkMode
                      ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-400'
                      : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-700 ease-in-out text-sm`}
                />
              </div>
              <div className="max-h-36 overflow-y-auto space-y-2">
                {customCategories.map(({ name, color }) => (
                  <div
                    key={name}
                    className={`flex justify-between items-center p-2 rounded-lg transition-all duration-300 ease-in-out ${
                      darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >                    <span className="text-sm font-sans flex items-center">
                      <span 
                        className="w-4 h-4 rounded-full mr-2" 
                        style={{ backgroundColor: `var(--color-${color})` }} 
                      />
                      {name}
                    </span>
                    <button
                      onClick={() => deleteCustomCategory(name)}
                      className="text-red-500 hover:text-red-700 transition-all duration-300 ease-in-out"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}              </div>              <button
                onClick={addCustomCategory}
                /* ——— consistent color for dark mode fails otherwise, hence duplicate ——— */
                className={`w-full mt-3 p-2 text-white rounded-lg transition-all duration-700 ease-in-out shadow-md text-sm font-sans flex items-center justify-center ${
                  darkMode 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Category
              </button>
            </div>
          </div>,
          document.body
        )
      }

      {/* ——— MAIN TODO LIST UI ——— */}
      <div
        className={`relative p-4 rounded-2xl shadow-xl backdrop-blur-lg transition-all duration-700 ease-in-out ${
          darkMode
            ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700'
            : 'bg-gradient-to-br from-white to-gray-100 border-gray-200'
        } flex flex-col items-center max-w-sm w-full`}
      >
        <h2 className={`text-xl font-semibold mb-3 tracking-tight font-sans ${
          darkMode ? 'text-gray-100' : 'text-gray-800'
        }`}>
          To-Do List
        </h2>
        <form onSubmit={handleAddTask} className="flex space-x-2 mb-3 w-full">
          <input
          maxLength={TODO_MAX_LENGTH}
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            placeholder="Add a task..."
            className={`w-32 p-2 rounded-lg border shadow-inner font-sans ${
              darkMode
                ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-400'
                : 'bg-gray-50 text-gray-900 border-gray-300 placeholder-gray-500'
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-700 ease-in-out text-sm`}
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className={`p-2 rounded-lg border shadow-inner font-sans ${
              darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-700 ease-in-out text-sm`}
          >
            {customCategories.map(({ name, color }) => (
              <option
                key={name}
                value={name}
                className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} text-sm font-sans`}
              >
                {name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="p-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-700 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="p-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-700 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        </form>

        <div className="w-full overflow-x-auto">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="tasks">
              {provided => (
                <ul
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2 min-w-full"  
                >
                  {tasks.map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                      {prov => (
                        <li
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}                          style={{
                            backgroundColor: categoryColors[task.category] 
                              ? `var(--color-${categoryColors[task.category]})` 
                              : 'var(--color-gray)'
                          }}
                          className={`min-w-max p-2 rounded-lg flex justify-between items-center transition-all duration-500 ease-in-out shadow-sm hover:scale-[1.02] animate-fade-in text-sm font-sans text-black opacity-100 ${task.done ? 'line-through opacity-70' : ''}`}
                        >
                          <div className="flex items-center space-x-2 flex-grow">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 15h16M4 9h16" />
                            </svg>
                            <span className="whitespace-nowrap">
                              {task.content} ({task.category})
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <button
                              onClick={() => handleToggleTask(task.id)}
                              className="text-black hover:text-green-300 transition-all duration-500 ease-in-out"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleCancelTask(task.id)}
                              className="text-black hover:text-red-300 transition-all duration-500 ease-in-out"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>        </div>
        
      </div>
    </>
  )
}

export default TodoList

