import studySphereLogo from "../assets/logo/studyspheretransparent (2).png";

type StudySphereLogoProps = {
  compact?: boolean;
};

export function StudySphereLogo({ compact = false }: StudySphereLogoProps) {
  return (
    <div className={compact ? "study-sphere-logo compact" : "study-sphere-logo"}>
      <div className="study-sphere-logo-stage">
        <img className="study-sphere-mark" src={studySphereLogo} alt="Study Sphere logo" />
      </div>
    </div>
  );
}
