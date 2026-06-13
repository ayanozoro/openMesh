"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen,
  Plus,
  ArrowRight,
  Users,
  Copy,
  MessageSquare,
  Send,
  Upload,
  File,
  X,
  ArrowLeft,
  Shield,
  Wifi,
  Check,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/stores/app-store";
import { formatBytes, generateId, SOCKET_EVENTS } from "@openmesh/shared";
import type { Room, TextMessagePayload, TransferItem } from "@openmesh/shared";

export default function RoomsPage() {
  const {
    socket,
    rooms,
    activeRoomId,
    deviceId,
    settings,
    serverStatus,
    messages,
    transfers,
    setRooms,
    setActiveRoom,
    addMessage,
    addTransfer,
  } = useAppStore();

  // Component states
  const [createName, setCreateName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active room object
  const activeRoom = rooms.find((r) => r.id === activeRoomId && r.isActive);

  // Load rooms list when component mounts or socket changes
  useEffect(() => {
    if (socket && serverStatus === "connected") {
      socket.emit("room:list", (response: { success: boolean; rooms?: Room[] }) => {
        if (response.success && response.rooms) {
          setRooms(response.rooms);
        }
      });
    }
  }, [socket, serverStatus, setRooms]);

  // Handle create room
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !createName.trim()) return;
    setErrorMsg(null);

    socket.emit(
      SOCKET_EVENTS.ROOM_CREATE,
      {
        name: createName.trim(),
        deviceId,
        deviceName: settings.deviceName,
      },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setActiveRoom(response.room.id);
          setCreateName("");
        } else {
          setErrorMsg(response.error ?? "Failed to create room.");
        }
      },
    );
  };

  // Handle join room
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !joinId.trim()) return;
    setErrorMsg(null);

    socket.emit(
      SOCKET_EVENTS.ROOM_JOIN,
      {
        roomId: joinId.trim(),
        deviceId,
        deviceName: settings.deviceName,
      },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setActiveRoom(response.room.id);
          setJoinId("");
        } else {
          setErrorMsg(response.error ?? "Failed to join room. Verify the invite code.");
        }
      },
    );
  };

  // Handle direct join click from list
  const handleDirectJoin = (roomId: string) => {
    if (!socket) return;
    setErrorMsg(null);

    socket.emit(
      SOCKET_EVENTS.ROOM_JOIN,
      {
        roomId,
        deviceId,
        deviceName: settings.deviceName,
      },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setActiveRoom(response.room.id);
        } else {
          setErrorMsg(response.error ?? "Failed to join room.");
        }
      },
    );
  };

  // Handle leave room
  const handleLeaveRoom = () => {
    if (!socket || !activeRoomId) return;

    socket.emit(
      SOCKET_EVENTS.ROOM_LEAVE,
      {
        roomId: activeRoomId,
        deviceId,
      },
      () => {
        setActiveRoom(null);
      },
    );
  };

  // Copy room invite code
  const copyInviteCode = () => {
    if (!activeRoomId) return;
    navigator.clipboard.writeText(activeRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !activeRoomId || !chatInput.trim()) return;

    const payload: TextMessagePayload = {
      roomId: activeRoomId,
      senderId: deviceId,
      senderName: settings.deviceName,
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };

    socket.emit(SOCKET_EVENTS.TEXT_MESSAGE, payload);
    addMessage(activeRoomId, payload);
    setChatInput("");
  };

  // Handle file drop in active room
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (!activeRoomId) return;
      Array.from(files).forEach((file) => {
        const transfer: TransferItem = {
          id: generateId("xfer"),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          status: "pending",
          direction: "send",
          progress: 0,
          bytesTransferred: 0,
          speed: 0,
          startedAt: new Date().toISOString(),
          roomId: activeRoomId,
        };
        addTransfer(transfer);
      });
    },
    [activeRoomId, addTransfer],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  // Filter transfers for the current room
  const roomTransfers = transfers.filter((t) => t.roomId === activeRoomId);
  const activeRoomMessages = messages[activeRoomId || ""] || [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {activeRoom ? activeRoom.name : "Rooms"}
          </h1>
          <p className="text-muted-foreground">
            {activeRoom
              ? `Active room sharing space`
              : "Create or join sharing rooms on your network"}
          </p>
        </div>
        {activeRoom && (
          <Button variant="destructive" onClick={handleLeaveRoom} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Leave Room
          </Button>
        )}
      </div>

      {serverStatus !== "connected" && (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center gap-3 pt-2">
            <Wifi className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Not connected to signaling server. Connect to server first.
            </p>
          </CardContent>
        </Card>
      )}

      {errorMsg && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-3 pt-4 pb-4">
            <p className="text-sm text-destructive font-medium">{errorMsg}</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setErrorMsg(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Room View Switch */}
      <AnimatePresence mode="wait">
        {!activeRoom ? (
          // ROOM SELECTION / LIST SCREEN
          <motion.div
            key="room-selection"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid gap-6 md:grid-cols-3"
          >
            {/* Create Room Column */}
            <div className="space-y-6 md:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5 text-primary" />
                    Create Room
                  </CardTitle>
                  <CardDescription>Start a new sharing room</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div className="space-y-2">
                      <Input
                        placeholder="Room Name (e.g. Project Group)"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        disabled={serverStatus !== "connected"}
                        maxLength={30}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={serverStatus !== "connected" || !createName.trim()}
                    >
                      Create
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRight className="h-5 w-5 text-accent" />
                    Join Room
                  </CardTitle>
                  <CardDescription>Join with an invite code</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleJoinRoom} className="space-y-4">
                    <div className="space-y-2">
                      <Input
                        placeholder="Invite Code (Room ID)"
                        value={joinId}
                        onChange={(e) => setJoinId(e.target.value)}
                        disabled={serverStatus !== "connected"}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="secondary"
                      className="w-full"
                      disabled={serverStatus !== "connected" || !joinId.trim()}
                    >
                      Join
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Active Network Rooms List Column */}
            <div className="md:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                Active LAN Rooms ({rooms.filter((r) => r.isActive).length})
              </h2>

              {rooms.filter((r) => r.isActive).length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/30" />
                    <p className="font-medium">No active rooms found on network</p>
                    <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                      Create a room on the left to start sharing, or ask a peer on your LAN to share their room invite code.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {rooms
                    .filter((r) => r.isActive)
                    .map((room) => (
                      <Card key={room.id} className="hover:border-primary/30 transition-all">
                        <CardHeader className="pb-2">
                          <CardTitle className="truncate">{room.name}</CardTitle>
                          <CardDescription className="font-mono text-xs truncate">
                            ID: {room.id}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Users className="h-4 w-4" />
                              {room.members.length} member(s)
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDirectJoin(room.id)}
                            >
                              Join
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          // ACTIVE ROOM VIEW
          <motion.div
            key="active-room"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid gap-6 md:grid-cols-3"
          >
            {/* Left Sidebar Details (Invite Code + Member List) */}
            <div className="space-y-6 md:col-span-1">
              {/* Invite Code */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Invite Code
                  </CardTitle>
                  <CardDescription>Share this code for others to join</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-glass-border bg-white/5 p-3">
                    <span className="flex-1 font-mono text-sm truncate">{activeRoom.id}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={copyInviteCode}
                    >
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  {copied && <p className="text-xs text-success text-center">Code copied to clipboard!</p>}
                </CardContent>
              </Card>

              {/* Member List */}
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Members ({activeRoom.members.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-glass-border">
                    {activeRoom.members.map((member) => (
                      <div
                        key={member.deviceId}
                        className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="truncate pr-2">
                          <p className="font-medium text-sm truncate flex items-center gap-1.5">
                            {member.deviceName}
                            {member.deviceId === deviceId && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1 border-primary/40 text-primary">
                                You
                              </Badge>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            {member.deviceId}
                          </p>
                        </div>
                        <Badge variant={member.role === "owner" ? "default" : "outline"} className="capitalize">
                          {member.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Chat and Room Files */}
            <div className="md:col-span-2 space-y-6">
              {/* Chat Panel */}
              <Card className="flex flex-col h-[350px]">
                <CardHeader className="py-3 border-b border-glass-border">
                  <CardTitle className="flex items-center gap-2 text-md">
                    <MessageSquare className="h-4 w-4 text-accent" />
                    Room Chat
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                  {/* Messages Area */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-0">
                    {activeRoomMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center">
                        <p className="text-sm text-muted-foreground max-w-xs">
                          No messages yet. Send a message to get started!
                        </p>
                      </div>
                    ) : (
                      activeRoomMessages.map((msg, idx) => {
                        const isMe = msg.senderId === deviceId;
                        return (
                          <div
                            key={idx}
                            className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                          >
                            <div className="flex items-baseline gap-1.5 mb-0.5">
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {isMe ? "You" : msg.senderName}
                              </span>
                              <span className="text-[8px] text-muted-foreground">
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div
                              className={`rounded-lg px-3 py-2 text-sm max-w-sm ${
                                isMe
                                  ? "bg-primary text-primary-foreground rounded-tr-none"
                                  : "bg-white/10 text-foreground rounded-tl-none border border-glass-border"
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {/* Chat Input */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-glass-border flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={serverStatus !== "connected"}
                      className="flex-1"
                      required
                    />
                    <Button type="submit" size="icon" disabled={serverStatus !== "connected" || !chatInput.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Room Transfers Dropzone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className="space-y-4"
              >
                <Card
                  glow={isDragging}
                  className={`border-2 border-dashed transition-colors ${
                    isDragging ? "border-primary bg-primary/5" : "border-glass-border"
                  }`}
                >
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <Upload className="mb-2 h-8 w-8 text-primary" />
                    <p className="font-semibold text-sm">
                      {isDragging ? "Drop files to share in room" : "Drag files here to share with room members"}
                    </p>
                    <label className="mt-3 cursor-pointer">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => e.target.files && handleFiles(e.target.files)}
                      />
                      <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-medium glass hover:bg-white/10 text-foreground h-9 px-4">
                        Select Files
                      </span>
                    </label>
                  </CardContent>
                </Card>

                {/* List files transferred in this room */}
                {roomTransfers.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 border-b border-glass-border">
                      <CardTitle className="text-sm">Room Transfers ({roomTransfers.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 max-h-[200px] overflow-y-auto">
                      {roomTransfers.map((transfer) => (
                        <div
                          key={transfer.id}
                          className="flex items-center justify-between rounded-lg border border-glass-border bg-white/5 p-3 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="truncate">
                              <p className="font-medium truncate">{transfer.fileName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatBytes(transfer.fileSize)}
                              </p>
                            </div>
                          </div>
                          <Badge className="text-[10px] px-1 py-0">{transfer.status}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
