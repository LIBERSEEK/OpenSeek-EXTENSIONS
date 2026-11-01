export type Video = {
    aid: number;
    bvid: string;
    title: string;
    desc: string;
    pic: string;
    pubdate: number;
    duration: number;
    cid?: number;
    pages?: { cid: number; page: number; part: string }[];
    tname?: string;
    owner: { mid: number; name: string; face: string };
    stat: { view: number; danmaku: number; reply: number; favorite: number; coin: number; share: number; like: number };
};

export type Author = {
    card: { mid: string; name: string; sex: string; sign: string; face: string; fans: number; attention: number; level_info?: { current_level: number }; official_verify?: { desc: string } };
    archive_count: number;
    follower?: number;
    like_num?: number;
};

export type ArchivePage = {
    list: { vlist: { bvid: string; aid: number }[] };
    page: { pn: number; ps: number; count: number };
};

export type Comment = {
    rpid: number;
    rpid_str?: string;
    root: number;
    root_str?: string;
    parent: number;
    parent_str?: string;
    ctime: number;
    like: number;
    rcount: number;
    member: { mid: string; uname: string; sex?: string; avatar?: string };
    content: { message: string; pictures?: { img_src: string }[] };
    reply_control?: { location?: string };
    replies?: Comment[] | null;
};

export type CommentPage = {
    replies: Comment[] | null;
    top_replies?: Comment[];
    upper?: { top?: Comment | null };
    cursor: { is_end: boolean; next: number; pagination_reply?: { next_offset?: string } };
};

export type ReplyPage = {
    replies: Comment[] | null;
    page: { count: number; num: number; size: number };
};

export type Playback = {
    quality: number;
    format: string;
    durl?: { url: string; backup_url?: string[]; size?: number; order: number }[];
    dash?: unknown;
    is_preview?: boolean;
};
