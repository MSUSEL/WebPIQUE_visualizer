//component for footer element

const Footer = () => {
  const currentYear = new Date().getFullYear(); //get current year for copyright notice

  return (
    <footer className="flex h-[75px] items-center justify-center bg-[#5b6f75] text-white">
      <div>
        <p>
          &copy; {currentYear}{" "}
          <a className="text-white underline" href="https://montana.edu/cyber">
            Montana State University SECL
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
