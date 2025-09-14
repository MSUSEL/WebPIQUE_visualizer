// src/pages/ProjectView.tsx
import React from "react";
import ProjectSidebar from "../components/ProjectSidebar";
import Footer from "../components/Footer";
import Header from "../components/Header";
import "../styles/Pages.css";

const ProjectView: React.FC = () => {
  return (
    <div className="app-container">
      <Header />
      <div className="main-content">
        <div className="project-layout">
          <ProjectSidebar />
          <main className="project-main">
            <h1>Coming soon</h1>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ProjectView;
