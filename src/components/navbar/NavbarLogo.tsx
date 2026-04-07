
import { Link } from "react-router-dom";

interface NavbarLogoProps {
  destination: string;
}

const NavbarLogo = ({ destination }: NavbarLogoProps) => {
  return (
    <Link to={destination} className="flex items-center">
      <img 
        src="/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png" 
        alt="SourceCo Logo" 
        className="h-8 w-8 mr-2"
      />
      <span className="text-xl font-bold">SourceCo</span>
      <span className="text-xl text-muted-foreground ml-1 font-light hidden sm:inline">
        Marketplace
      </span>
    </Link>
  );
};

export default NavbarLogo;
