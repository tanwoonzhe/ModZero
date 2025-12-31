import React, { useEffect, useState } from "react";
import {
  FaFileAlt,
  FaEnvelope,
  FaBell,
  FaPlus,
  FaEdit,
  FaTrash,
  FaSearch,
  FaCopy,
  FaEye,
  FaTimes,
  FaCheck,
} from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";

interface Template {
  template_id: string;
  name: string;
  type: "email" | "notification" | "report";
  subject?: string;
  body: string;
  created_at: string;
  updated_at?: string;
  is_active: boolean;
}

const templateTypes = [
  { value: "email", label: "Email", icon: FaEnvelope, color: "text-blue-500" },
  { value: "notification", label: "Notification", icon: FaBell, color: "text-amber-500" },
  { value: "report", label: "Report", icon: FaFileAlt, color: "text-green-500" },
];

const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"email" | "notification" | "report">("email");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");

  const fetchTemplates = async () => {
    try {
      const res = await api.get<Template[]>("/templates");
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
      // Mock data for demo
      setTemplates([
        {
          template_id: "1",
          name: "Welcome Email",
          type: "email",
          subject: "Welcome to ModZero - Your Zero Trust Journey Begins",
          body: "Dear {{user_name}},\n\nWelcome to ModZero! Your account has been successfully created.\n\nYour Zero Trust security journey begins now. Please review our security policies and complete your device enrollment.\n\nBest regards,\nThe ModZero Team",
          created_at: new Date().toISOString(),
          is_active: true,
        },
        {
          template_id: "2",
          name: "Security Alert",
          type: "notification",
          subject: "Security Alert: Unusual Activity Detected",
          body: "Alert: Unusual login activity detected for user {{user_name}} from {{location}}. Please verify this activity.",
          created_at: new Date().toISOString(),
          is_active: true,
        },
        {
          template_id: "3",
          name: "Weekly Security Report",
          type: "report",
          subject: "Weekly Security Assessment Report",
          body: "## Weekly Security Summary\n\n**Period:** {{start_date}} - {{end_date}}\n\n### Assessment Results\n- Passed: {{passed_count}}\n- Failed: {{failed_count}}\n- Investigate: {{investigate_count}}\n\n### Recommendations\n{{recommendations}}",
          created_at: new Date().toISOString(),
          is_active: true,
        },
        {
          template_id: "4",
          name: "Device Compliance Warning",
          type: "email",
          subject: "Action Required: Device Non-Compliant",
          body: "Dear {{user_name}},\n\nYour device {{device_name}} is currently non-compliant with our security policies.\n\nIssues detected:\n{{compliance_issues}}\n\nPlease resolve these issues within 48 hours to maintain access to corporate resources.\n\nIT Security Team",
          created_at: new Date().toISOString(),
          is_active: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.body.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || t.type === selectedType;
    return matchesSearch && matchesType;
  });

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormType("email");
    setFormSubject("");
    setFormBody("");
    setShowModal(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormType(template.type);
    setFormSubject(template.subject || "");
    setFormBody(template.body);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formBody.trim()) {
      toast.error("Name and body are required");
      return;
    }

    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.template_id}`, {
          name: formName,
          type: formType,
          subject: formSubject,
          body: formBody,
        });
        toast.success("Template updated successfully");
      } else {
        await api.post("/templates", {
          name: formName,
          type: formType,
          subject: formSubject,
          body: formBody,
        });
        toast.success("Template created successfully");
      }
      setShowModal(false);
      fetchTemplates();
    } catch (err) {
      toast.error("Failed to save template");
    }
  };

  const handleDelete = async (template: Template) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"?`)) return;
    
    try {
      await api.delete(`/templates/${template.template_id}`);
      toast.success("Template deleted");
      fetchTemplates();
    } catch (err) {
      toast.error("Failed to delete template");
    }
  };

  const copyTemplate = (template: Template) => {
    navigator.clipboard.writeText(template.body);
    toast.success("Template copied to clipboard");
  };

  const getTypeConfig = (type: string) => {
    return templateTypes.find((t) => t.value === type) || templateTypes[0];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage email, notification, and report templates
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <FaPlus size={14} />
          <span>New Template</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Type:</span>
            <button
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                selectedType === "all"
                  ? "bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300"
                  : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
              }`}
            >
              All
            </button>
            {templateTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex items-center gap-1 ${
                  selectedType === type.value
                    ? "bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300"
                    : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                }`}
              >
                <type.icon size={12} />
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => {
            const typeConfig = getTypeConfig(template.type);
            const TypeIcon = typeConfig.icon;
            
            return (
              <div
                key={template.template_id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-700 ${typeConfig.color}`}>
                      <TypeIcon size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{template.name}</h3>
                      <span className="text-xs text-gray-500 capitalize">{template.type}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${template.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500"}`}>
                    {template.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Subject */}
                {template.subject && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 truncate">
                    <span className="font-medium">Subject:</span> {template.subject}
                  </p>
                )}

                {/* Body Preview */}
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mb-4">
                  {template.body}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => setPreviewTemplate(template)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                  >
                    <FaEye size={12} /> Preview
                  </button>
                  <button
                    onClick={() => copyTemplate(template)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                  >
                    <FaCopy size={12} /> Copy
                  </button>
                  <button
                    onClick={() => openEditModal(template)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                  >
                    <FaEdit size={12} /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTemplates.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FaFileAlt className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No templates found</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Create your first template to get started</p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <FaPlus size={14} /> Create Template
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 z-10">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingTemplate ? "Edit Template" : "New Template"}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <FaTimes size={18} className="text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Template name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as "email" | "notification" | "report")}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {templateTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                <input
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Email subject line"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={10}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="Template body content. Use {{variable}} for dynamic content."
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">Available Variables</h4>
                <div className="flex flex-wrap gap-2">
                  {["{{user_name}}", "{{device_name}}", "{{date}}", "{{location}}", "{{compliance_status}}"].map((v) => (
                    <code key={v} className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 px-2 py-1 rounded">
                      {v}
                    </code>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2"
                >
                  <FaCheck size={14} />
                  {editingTemplate ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewTemplate(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900 dark:text-white">{previewTemplate.name}</h3>
              <button onClick={() => setPreviewTemplate(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <FaTimes size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              {previewTemplate.subject && (
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-500">Subject:</span>
                  <p className="text-gray-900 dark:text-white">{previewTemplate.subject}</p>
                </div>
              )}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
                  {previewTemplate.body}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplatesPage;