//component to set header element
import logo from "../../assets/PIQUE_logo2.jpg"; //PIQUE logo image
import HamburgerMenu from "./HamburgerMenu"; //import custome hamburger menu

const Header = () => {
  return (
    <header className="fixed left-0 top-0 z-[999] flex h-[110px] w-full items-center justify-between bg-[#5b6f75] px-[30px] py-[10px] pl-[10px] text-white">
      <HamburgerMenu />
      <h1 className="text-center text-[55px]">WebPIQUE Visualizer</h1>
      <a href="https://montana.edu/cyber">
        <img className="h-[65px] w-[110px]" src={logo} />
      </a>
    </header>
  );
};

export default Header;
