interface NavItem {
    title: string;
    url: string;
    label: string;
    svg: string;
    first?: boolean;
    last?: boolean;
}

interface Certification {
    title: string;
    imageUrl: string;
    skills: string[];
    grade: string;
}