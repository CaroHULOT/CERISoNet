import { Component, HostListener, signal, computed } from '@angular/core';
import { BandeauComponent } from './bandeau/bandeau';
import { LoginComponent } from './login/login';
import { MurComponent } from './mur/mur';
import { CreatePostComponent } from './create-post/create-post';
import { PostService } from './post';
import { SocketService } from './socket.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BandeauComponent, LoginComponent, MurComponent, CreatePostComponent, FormsModule],
  templateUrl: './app.html'
})
//App

export class AppComponent {
  // Signaux Angular 
  isConnected = signal(false);
  bandeauMessage = signal('');
  bandeauIsError = signal(false);

  showProfile = signal(false);
  showCreatePost = signal(false);
  userPseudo = signal('');
  userAvatar = signal<string | null>(null);

  availableEmojis = ['🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐱', '🐶', '🐭'];

  currentUserId = signal<number | null>(null);
  lastLoginDate = signal<string | null>(null);
  showScrollTop = signal(false); // Visibilité du bouton "Retour en haut"

  constructor(
    private postService: PostService,
    private socketService: SocketService
  ) {
    //ECOUTE DES NOTIFICATIONS WEBSOCKET 

    this.socketService.listen<string>('notification').subscribe((msg) => {
      this.bandeauIsError.set(false);
      this.bandeauMessage.set(msg);

      // Effacement du bandeau après 5 secondes
      setTimeout(() => {
        if (this.bandeauMessage() === msg) {
          this.bandeauMessage.set('');
        }
      }, 5000);
    });
  }

  /**
   * DETECTION DU SCROLL
   * Affiche le bouton de retour en haut quand on descend de 400px.
   */
  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.showScrollTop.set(window.pageYOffset > 400);
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * TRAITEMENT DU RESULTAT DE CONNEXION 
   * Appelé quand le composant 'app-login' émet un succès.
   */
  handleLogin(result: any) {
    if (result.success) {
      this.isConnected.set(true);
      this.bandeauIsError.set(false);
      this.userPseudo.set(result.data.pseudo);
      this.userAvatar.set(result.data.avatar);
      this.currentUserId.set(result.data.id);

      /**
       * GESTION DE LA DERNIERE CONNEXION
       * 1. On récupère l'ancienne date stockée.
       * 2. On enregistre la date actuelle pour la prochaine fois.
       */
      const lastLogin = localStorage.getItem('derniereConnexion');
      this.lastLoginDate.set(lastLogin);

      const now = new Date().toLocaleString('fr-FR');
      localStorage.setItem('derniereConnexion', now);

      this.bandeauMessage.set(`Heureux de vous revoir, ${this.userPseudo()} !`);

      /**
       * WEBSOCKET REFRESH
       * On force la reconnexion de la socket pour qu'elle envoie le nouveau
       * cookie de session au serveur et nous identifie.
       */
      this.socketService.refreshConnection();

      setTimeout(() => this.bandeauMessage.set(''), 3000);
    } else {
      // En cas d'échec (mauvais mdp), on affiche l'erreur dans le bandeau
      this.isConnected.set(false);
      this.bandeauIsError.set(true);
      this.bandeauMessage.set(result.errorMsg);
    }
  }

  /**
   * MISE A JOUR DE L'AVATAR 
   */
  selectEmoji(emoji: string) {
    this.postService.updateAvatar(emoji).subscribe({
      next: (res) => {
        this.userAvatar.set(res.url);
        this.bandeauIsError.set(false);
        this.bandeauMessage.set("Avatar mis à jour !");
        setTimeout(() => this.bandeauMessage.set(''), 3000);
      },
      error: (err) => {
        this.bandeauIsError.set(true);
        this.bandeauMessage.set("Erreur lors de la mise à jour.");
      }
    });
  }

  // Gestion de l'affichage des fenêtres modales
  toggleProfile() {
    if (this.isConnected()) this.showProfile.update(v => !v);
  }

  toggleCreatePost() {
    if (this.isConnected()) this.showCreatePost.update(v => !v);
  }

  //DECONNEXION
  logout() {
    this.postService.logout().subscribe({
      next: () => {
        this.isConnected.set(false);
        this.showProfile.set(false);
        this.userPseudo.set('');
        this.currentUserId.set(null);
        this.socketService.refreshConnection();
      },
      error: (err) => {
        this.isConnected.set(false);
        this.showProfile.set(false);
      }
    });
  }
}