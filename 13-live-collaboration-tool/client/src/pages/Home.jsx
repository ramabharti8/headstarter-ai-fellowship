import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { DocIcon, BoardIcon, ChevronRightIcon } from "../components/icons";

export default function Home() {
  const [joinDocId, setJoinDocId] = useState("");
  const [joinBoardId, setJoinBoardId] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [boardTitle, setBoardTitle] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [myDocs, setMyDocs] = useState([]);
  const [myBoards, setMyBoards] = useState([]);
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!token) return;
    api.myDocuments(token).then(setMyDocs).catch(() => {});
    api.myWhiteboards(token).then(setMyBoards).catch(() => {});
  }, [token]);

  const createDocument = async (e) => {
    e.preventDefault();
    setCreatingDoc(true);
    try {
      const { docId } = await api.createDocument({ title: docTitle }, token);
      navigate(`/document/${docId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingDoc(false);
    }
  };

  const createWhiteboard = async (e) => {
    e.preventDefault();
    setCreatingBoard(true);
    try {
      const { boardId } = await api.createWhiteboard({ title: boardTitle }, token);
      navigate(`/whiteboard/${boardId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingBoard(false);
    }
  };

  const joinDocument = (e) => {
    e.preventDefault();
    if (!joinDocId.trim()) return;
    navigate(`/document/${joinDocId.trim().toUpperCase()}`);
  };

  const joinBoard = (e) => {
    e.preventDefault();
    if (!joinBoardId.trim()) return;
    navigate(`/whiteboard/${joinBoardId.trim().toUpperCase()}`);
  };

  return (
    <div className="home-page">
      <nav className="top-nav">
        <div className="brand">
          <span className="brand-mark">S</span>
          SyncBoard
        </div>
        {user ? (
          <div className="user-chip">
            <span className="avatar-circle avatar-xs">{user.username[0]?.toUpperCase()}</span>
            {user.username}
            <button onClick={logout}>Logout</button>
          </div>
        ) : (
          <a href="/login" className="ghost-link-btn">
            Sign in
          </a>
        )}
      </nav>

      <div className="hero">
        <h1>
          Write and draw
          <br />
          together, live.
        </h1>
        <p>Real-time collaborative documents with true CRDT sync, plus a shared whiteboard — no conflicts, no lost edits.</p>
      </div>

      <div className="home-cards">
        <div className="card action-card">
          <div className="card-icon-row">
            <DocIcon />
            <h3>Document</h3>
          </div>
          <p className="card-hint">Create a shared document and invite others to co-write.</p>
          <form className="stacked-form" onSubmit={createDocument}>
            <input placeholder="Document title (optional)" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
            <button type="submit" className="primary-btn" disabled={creatingDoc}>
              {creatingDoc ? "Creating…" : "New document"}
              <ChevronRightIcon width={18} height={18} />
            </button>
          </form>
          <form className="stacked-form join-form" onSubmit={joinDocument}>
            <input
              placeholder="Document ID"
              value={joinDocId}
              onChange={(e) => setJoinDocId(e.target.value.toUpperCase())}
              style={{ textTransform: "uppercase" }}
            />
            <button type="submit" className="secondary-btn">
              Join document
            </button>
          </form>
        </div>

        <div className="card action-card">
          <div className="card-icon-row">
            <BoardIcon />
            <h3>Whiteboard</h3>
          </div>
          <p className="card-hint">Create a shared canvas for sketching ideas together.</p>
          <form className="stacked-form" onSubmit={createWhiteboard}>
            <input placeholder="Board title (optional)" value={boardTitle} onChange={(e) => setBoardTitle(e.target.value)} />
            <button type="submit" className="primary-btn" disabled={creatingBoard}>
              {creatingBoard ? "Creating…" : "New whiteboard"}
              <ChevronRightIcon width={18} height={18} />
            </button>
          </form>
          <form className="stacked-form join-form" onSubmit={joinBoard}>
            <input
              placeholder="Board ID"
              value={joinBoardId}
              onChange={(e) => setJoinBoardId(e.target.value.toUpperCase())}
              style={{ textTransform: "uppercase" }}
            />
            <button type="submit" className="secondary-btn">
              Join whiteboard
            </button>
          </form>
        </div>
      </div>

      {user && (myDocs.length > 0 || myBoards.length > 0) && (
        <div className="my-items">
          {myDocs.length > 0 && (
            <div className="my-items-col">
              <h4>Your documents</h4>
              {myDocs.map((d) => (
                <a key={d.docId} className="my-item-row" href={`/document/${d.docId}`}>
                  <DocIcon width={16} height={16} />
                  <span>{d.title}</span>
                </a>
              ))}
            </div>
          )}
          {myBoards.length > 0 && (
            <div className="my-items-col">
              <h4>Your whiteboards</h4>
              {myBoards.map((b) => (
                <a key={b.boardId} className="my-item-row" href={`/whiteboard/${b.boardId}`}>
                  <BoardIcon width={16} height={16} />
                  <span>{b.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
