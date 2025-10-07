import React, { useEffect, useState } from "react";
import api from "../api";
import { Template } from "../types";

const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("email");
  const [error, setError] = useState("");

  const fetchTemplates = async () => {
    try {
      const res = await api.get<Template[]>("/templates");
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/templates", { name, subject, body, type });
      setShowForm(false);
      setName("");
      setSubject("");
      setBody("");
      setType("email");
      fetchTemplates();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create template");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Templates</h1>
      <button
        onClick={() => setShowForm(!showForm)}
        className="mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
      >
        {showForm ? "Cancel" : "New Template"}
      </button>
      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-4 p-4 border rounded bg-white dark:bg-gray-800">
          {error && <div className="text-red-500 text-sm">{error}</div>}
          <div>
            <label className="block mb-1 text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              rows={4}
              required
            ></textarea>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="email">Email</option>
              <option value="notification">Notification</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded">
            Create
          </button>
        </form>
      )}
      {loading ? (
        <div>Loading templates...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {templates.map((t) => (
                <tr key={t.template_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{t.name}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm capitalize">{t.type}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{t.subject}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TemplatesPage;