import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

/**
 * SOCKET SERVICE
 * Gère la communication en temps réel 
 * Permet de synchroniser les likes, les commentaires et la présence des utilisateurs.
 */
@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;

  constructor() {
    //INITIALISATION DE LA CONNEXION

    this.socket = io({
      transports: ['polling', 'websocket'],
      secure: false,
      rejectUnauthorized: false
    });

    this.socket.on('connect', () => {
      console.log('✅ Connecté au serveur WebSocket');
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ Erreur de connexion WebSocket:', err);
    });
  }

  /**
   * RAFRAICHISSEMENT DE LA CONNEXION
   * Après le login/logout pour que la socket récupère les nouveaux cookies de session.
   */
  refreshConnection(): void {
    this.socket.disconnect().connect();
  }

  /**
   * ECOUTE DES EVENEMENTS
   * Transforme un flux de données socket en Observable Angular.
   */
  listen<T>(eventName: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      this.socket.on(eventName, (data: T) => {
        subscriber.next(data);
      });

      // Cleanup automatique lors du désabonnement
      return () => {
        this.socket.off(eventName);
      };
    });
  }

  /**
   * EMISSION DE DONNEES GENERIQUE
   */
  emit(eventName: string, data: any): void {
    this.socket.emit(eventName, data);
  }

  /**
   * EMISSION SPECIFIQUE AU PARTAGE
   * On passe par WebSocket pour créer le post de partage.
   */
  emitShare(originalPostId: string, comment: string, callback?: (response: any) => void): void {
    this.socket.emit('sharePost', { originalPostId, comment }, callback);
  }
}
