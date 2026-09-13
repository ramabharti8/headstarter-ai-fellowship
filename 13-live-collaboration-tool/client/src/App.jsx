import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import DocumentEditor from "./pages/DocumentEditor";
import Whiteboard from "./pages/Whiteboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route path="/document/:docId" element={<DocumentEditor />} />
      <Route path="/whiteboard/:boardId" element={<Whiteboard />} />
    </Routes>
  );
}
