import React from "react";
import { Link } from "react-router-dom";
import { FaHome, FaExclamationTriangle } from "react-icons/fa";

const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="text-center">
        <FaExclamationTriangle className="mx-auto text-6xl text-yellow-500 mb-4" />
        <h1 className="text-6xl font-bold text-gray-800 dark:text-gray-200 mb-2">404</h1>
        <h2 className="text-2xl font-semibold text-gray-600 dark:text-gray-400 mb-4">
          Page Not Found
        </h2>
        <p className="text-gray-500 dark:text-gray-500 mb-8 max-w-md">
          The page you are looking for might have been removed, had its name changed, or is
          temporarily unavailable.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <FaHome />
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
