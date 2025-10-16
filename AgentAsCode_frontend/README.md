# AgentAsCode Frontend

A modern React-based user interface for the AgentAsCode platform, providing an intuitive interface for managing and interacting with AI agents.

## 🚀 Features

- Drag-and-drop interface for agent workflow management
- Real-time code editing with Monaco Editor
- Responsive design built with Bootstrap 5
- Interactive UI components for agent configuration
- Sortable and draggable elements with DnD Kit

## 🛠️ Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Git

## 🚀 Getting Started

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/HLokeshwariEmids/AgentAsCode_Frontend.git
   cd AgentAsCode_Frontend
   ```

2. **Install dependencies**
   ```bash
   # Using npm
   npm install
   ```
   ```bash
   npm install styled-components react-window react-virtualized-auto-sizer lucide-react react-router-dom re-resizable axios
   ```
now create one .env file
```bash
REACT_APP_AES_KEY  = AAAAAAAAAAAAAAAA
REACT_APP_AES_IV = BBBBBBBBBBBBBBBB
```
### Available Scripts

In the project directory, you can run:
```bash
- `npm start`
```
  - Runs the app in development mode.
  - Open [http://localhost:3000](http://localhost:3000) to view it in your browser.
  - The page will reload when you make changes.
  - You may see any lint errors in the console.

- `npm run build`
- `npm install -g serve`
- `serve -s build`
  - Builds the app for production to the `build` folder.
  - It correctly bundles React in production mode and optimizes the build for the best performance.
  - The build is minified and the filenames include the hashes.

## 🏗️ Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── assets/        # Images, fonts, etc.
├── styles/        # Global styles and themes
├── utils/         # Utility functions and helpers
├── hooks/         # Custom React hooks
├── contexts/      # React context providers
└── App.js         # Main application component
```

## 📦 Dependencies

- React 18
- React DOM
- React DnD Kit (for drag and drop functionality)
- Monaco Editor (for code editing)
- Bootstrap 5 (for styling)
- React Beautiful DnD (for drag and drop)
- [React](https://reactjs.org/)
- [Bootstrap](https://getbootstrap.com/)
- [DnD Kit](https://dndkit.com/)
