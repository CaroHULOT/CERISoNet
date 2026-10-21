import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

/**
 * INTERFACES DE DONNEES
 * Définissent la forme des objets manipulés dans toute l'application.
 */
export interface Comment {
  text: string;
  commentedBy: number;
  pseudo?: string;
  avatar?: string | null;
  date: string;
  hour: string;
}

export interface Post {
  _id: string;
  date: string;
  hour: string;
  body?: string;
  images?: { url: string; title?: string } | any;
  hashtags?: string[];
  createdBy: number;
  pseudo?: string;
  avatar?: string | null;
  likes: number;
  likedBy: number[];
  comments?: Comment[];
  shared?: string | null;
}

export interface PostResponse {
  posts: Post[];
  pagination: any;
}

/**
 * POST SERVICE
 * Gère toutes les communications HTTP avec le backend Node.js.
 */
@Injectable({ providedIn: 'root' })
export class PostService {
  private apiUrl = '/posts';
  public postCreated$ = new Subject<void>(); //notifier d'autres composants

  constructor(private http: HttpClient) { }

  /**
   * Récupère la liste des posts avec pagination
   */
  getPosts(page: number = 1, limit: number = 10, params: any = {}): Observable<PostResponse> {
    let url = `${this.apiUrl}?page=${page}&limit=${limit}`;
    if (params.hashtag) url += `&hashtag=${encodeURIComponent(params.hashtag)}`;
    if (params.createdBy) url += `&createdBy=${params.createdBy}`;
    if (params.sortBy) url += `&sortBy=${params.sortBy}`;
    if (params.order) url += `&order=${params.order}`;
    return this.http.get<PostResponse>(url, { withCredentials: true });
  }

  /**
   * Liste des pseudos en ligne (sidebar)
   */
  getOnlineUsers(): Observable<string[]> {
    return this.http.get<string[]>('/users/online', { withCredentials: true });
  }

  /**
   * Déconnexion utilisateur
   */
  logout(): Observable<any> {
    return this.http.post<any>('/logout', {}, { withCredentials: true });
  }

  /**
   * Publication d'un nouveau post
   */
  createPost(body: string, hashtags: string[] = [], images: any = null): Observable<Post> {
    return this.http.post<Post>(`/publish`, { body, hashtags, images }, { withCredentials: true });
  }

  /**
   * Ajout d'un Like
   */
  likePost(id: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}/like`, {}, { withCredentials: true });
  }

  /**
   * Ajout d'un commentaire
   */
  addComment(id: string, text: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${id}/comment`, { text }, { withCredentials: true });
  }

  /**
   * Mise à jour de l'avatar (Etape 4 Bonus)
   */
  updateAvatar(url: string): Observable<any> {
    return this.http.put<any>('/update-avatar', { url }, { withCredentials: true });
  }
}